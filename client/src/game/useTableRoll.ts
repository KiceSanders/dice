import type { ClientMessage, Die, PoseFrame, RoomSnapshot } from '@dice/shared';
import { canStandVoluntarily, validateRestPose } from '@dice/shared';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { TurnActions } from '../components/GameArea';
import { describeScore } from '../components/GameHud';
import type { TableDiceProps, ThrowVelocity } from '../table3d/dice/types';
import { displaySeatIndex } from '../table3d/layout';
import { poseFrameToCanonical } from '../table3d/seatTransform';
import { togglePendingKeep } from './keepSelection';

const ZERO_VELOCITY: ThrowVelocity = { x: 0, y: 0, z: 0 };

/** Batch pose frames so a 20 Hz sample rate costs ~10 messages/s on the wire. */
const FRAMES_PER_MESSAGE = 2;
const FRAME_FLUSH_MS = 200;

function isValidPoseFrame(frame: PoseFrame): boolean {
  return frame.bodies.every((b) => b.every((n) => Number.isFinite(n)));
}

/**
 * Live-game counterpart of the Playground's turn wiring (ADR 004): binds the
 * 3D table dice to the WebSocket protocol. Releasing the koozie sends
 * turn:throwStart (locking the pending keeps), the settled faces go up as
 * turn:throwResult, and the authoritative turn state comes back through the
 * normal snapshot / turn:rolled flow. Keep clicks stay local until the next
 * throw locks them in.
 *
 * Only the active roller gets `tableDice`; spectators use StaticDiceView for
 * the last roll and RemoteDiceView during streamed throws.
 */
export function useTableRoll(
  snapshot: RoomSnapshot | null,
  myId: string | null,
  send: (msg: ClientMessage) => boolean,
  connected: boolean,
) {
  const [pendingKeep, setPendingKeep] = useState<number[]>([]);
  const [dragging, setDragging] = useState(false);
  const [rolling, setRolling] = useState(false);
  const [pointerOnTable, setPointerOnTable] = useState(false);
  const [releaseSignal, setReleaseSignal] = useState(0);
  const [releaseVelocity, setReleaseVelocity] = useState<ThrowVelocity>(ZERO_VELOCITY);
  const pendingKeepRef = useRef<number[]>([]);

  const turn = snapshot?.game?.currentTurn ?? null;
  const isMyTurn = turn !== null && myId !== null && turn.playerId === myId;
  const mySeat = snapshot?.players.find((p) => p.id === myId)?.seat ?? 0;
  const activeSeat =
    turn !== null ? (snapshot?.players.find((p) => p.id === turn.playerId)?.seat ?? null) : null;
  // Spectators see a parked cup at the active player's display seat. The
  // roller mounts DicePhysics instead (always docks at display seat 0).
  const parkedKoozieDisplaySeat =
    snapshot?.phase === 'playing' && activeSeat !== null && !isMyTurn
      ? displaySeatIndex(activeSeat, mySeat)
      : null;

  // New roll confirmed or turn changed: sync selection to the server's locked
  // keeps and drop any stale interaction state.
  useEffect(() => {
    const next = turn ? [...turn.keptIndices] : [];
    pendingKeepRef.current = next;
    setPendingKeep(next);
    setDragging(false);
    setRolling(false);
  }, [turn?.playerId, turn?.rollsUsed]); // eslint-disable-line react-hooks/exhaustive-deps

  const onRelease = useCallback(
    (velocity: ThrowVelocity) => {
      setReleaseVelocity(velocity);
      setReleaseSignal((s) => s + 1);
      setRolling(true);
      send({ type: 'turn:throwStart', keepIndices: pendingKeepRef.current });
    },
    [send],
  );

  const onSettled = useCallback(
    (dice: Die[], settleFrame: PoseFrame) => {
      setRolling(false);
      // Report where the dice came to rest alongside the values (ADR 005):
      // canonical space, dice only (frame bodies are cup-first). Validate with
      // the same shared check the server runs — if it would be dropped there
      // (e.g. dev face overrides), omit it rather than blocking the throw.
      const canonical = poseFrameToCanonical(settleFrame, mySeat);
      const restPose = canonical.bodies.slice(1);
      const valid = restPose.length === dice.length && validateRestPose(restPose, dice) === null;
      send({ type: 'turn:throwResult', dice, ...(valid ? { restPose } : {}) });
    },
    [send, mySeat],
  );

  // Pose streaming out to spectators: batch samples, flush by count or timer.
  const frameBufRef = useRef<PoseFrame[]>([]);
  const flushTimerRef = useRef<number | null>(null);
  const flushFrames = useCallback(() => {
    if (flushTimerRef.current !== null) {
      clearTimeout(flushTimerRef.current);
      flushTimerRef.current = null;
    }
    if (frameBufRef.current.length === 0) return;
    send({ type: 'dice:frames', frames: frameBufRef.current });
    frameBufRef.current = [];
  }, [send]);

  const onPoseFrame = useCallback(
    (frame: PoseFrame) => {
      if (!isValidPoseFrame(frame)) return;
      const canonical = poseFrameToCanonical(frame, mySeat);
      frameBufRef.current.push(canonical);
      if (!canonical.cupVisible || frameBufRef.current.length >= FRAMES_PER_MESSAGE) flushFrames();
      else if (flushTimerRef.current === null) {
        flushTimerRef.current = window.setTimeout(flushFrames, FRAME_FLUSH_MS);
      }
    },
    [flushFrames, mySeat],
  );

  useEffect(() => () => flushFrames(), [flushFrames]);

  const onKeepToggle = useCallback(
    (index: number) => {
      if (!turn || !isMyTurn) return;
      const next = togglePendingKeep(
        index,
        pendingKeepRef.current,
        turn.keptIndices,
        turn.rollsUsed > 0,
      );
      if (!next) return;
      pendingKeepRef.current = next;
      setPendingKeep(next);
      return next;
    },
    [turn, isMyTurn],
  );

  const updatePendingKeep = useCallback((indices: number[]) => {
    pendingKeepRef.current = indices;
    setPendingKeep(indices);
  }, []);

  const onTablePointer = useCallback((inside: boolean) => {
    setPointerOnTable(inside);
  }, []);

  // Stays true across the whole turn: DicePhysics guards grabs internally
  // (rollingRef/draggingRef), and a transient false at settle time would be
  // snapshotted into enterSelectingPhase's cup visibility (bug: hidden koozie).
  const canDrag = isMyTurn && connected && snapshot?.phase === 'playing';

  const tableDice: TableDiceProps | undefined =
    turn && isMyTurn
      ? {
          releaseSignal,
          releaseVelocity,
          keepIndices: pendingKeep,
          lockedKeepIndices: turn.keptIndices,
          dice: turn.dice,
          canDrag,
          active: true,
          onSettled,
          onRelease,
          onDragChange: setDragging,
          onRollingChange: setRolling,
          onKeepToggle,
          onPoseFrame,
        }
      : undefined;

  // Voluntary-stand gate (shared rule, mirrored by the server): standing while
  // losing to the roll-to-beat is not allowed — keep rolling instead.
  const rollToBeat = snapshot?.game?.rollToBeat ?? null;
  const canStand =
    turn !== null && canStandVoluntarily(turn.dice, turn.rollsUsed, rollToBeat?.score ?? null);
  const standHint =
    turn && !canStand && turn.rollsUsed > 0 && rollToBeat
      ? (() => {
          const names = rollToBeat.playerIds
            .map((id) => snapshot?.players.find((p) => p.id === id)?.name)
            .filter((n): n is string => Boolean(n));
          const who = names.length === 0 ? "the leader's" : `${names.join(' / ')}'s`;
          return `Beat or tie ${who} ${describeScore(rollToBeat.score)} to stand`;
        })()
      : undefined;

  const turnActions: TurnActions | undefined = tableDice
    ? {
        onStand: () => send({ type: 'turn:stand' }),
        canStand,
        standHint,
        disabled: rolling || !connected,
        aiming: dragging,
      }
    : undefined;

  return {
    /** Defined only for the active roller: full 3D roll wiring for `<Table dice>`. */
    tableDice,
    /** Stand / keep-all controls routed over the socket; undefined off-turn. */
    turnActions,
    pendingKeep,
    setPendingKeep: updatePendingKeep,
    /** True while this client's 3D roll owns the dice display (hide 2D dice). */
    active: tableDice !== undefined,
    diceAiming: dragging || (pointerOnTable && isMyTurn && !rolling),
    onTablePointer,
    rolling,
    dragging,
    /** Spectator parked-cup display seat; null for the roller or off-play. */
    parkedKoozieDisplaySeat,
  };
}
