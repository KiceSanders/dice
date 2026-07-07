import type { ClientMessage, Die, PoseFrame, RoomSnapshot } from '@dice/shared';
import { canStandVoluntarily } from '@dice/shared';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { TurnActions } from '../components/GameArea';
import { describeScore } from '../components/GameHud';
import type { TableDiceProps, ThrowVelocity } from '../table3d/dice/types';
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
 * Only the active roller gets `tableDice`; everyone else keeps the 2D view
 * (spectator 3D playback arrives with dice:frames handling).
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
  // Timestamped so Room can pick the most recently finished turn between this
  // and the remote-roll held pose — plain null-coalescing order is staleness-blind.
  const [held, setHeld] = useState<{ frame: PoseFrame; at: number } | null>(null);
  const pendingKeepRef = useRef<number[]>([]);
  const latestPoseRef = useRef<PoseFrame | null>(null);
  const wasMyTurnRef = useRef(false);

  const turn = snapshot?.game?.currentTurn ?? null;
  const isMyTurn = turn !== null && myId !== null && turn.playerId === myId;
  const mySeat = snapshot?.players.find((p) => p.id === myId)?.seat ?? 0;

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
      setHeld(null);
      send({ type: 'turn:throwStart', keepIndices: pendingKeepRef.current });
    },
    [send],
  );

  const onSettled = useCallback(
    (dice: Die[]) => {
      setRolling(false);
      send({ type: 'turn:throwResult', dice });
    },
    [send],
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
      // heldPose renders locally, so keep the view-local frame; only the wire
      // gets the canonical (seat-rotated) copy.
      latestPoseRef.current = frame;
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

  useEffect(() => {
    const wasMyTurn = wasMyTurnRef.current;
    if (wasMyTurn && !isMyTurn) {
      const lastPose = latestPoseRef.current;
      if (lastPose && !lastPose.cupVisible) setHeld({ frame: lastPose, at: performance.now() });
    }
    // My own sim owns the table for the whole turn — drop the stale pose so it
    // can't resurface later as ghost dice from a previous round.
    if (!wasMyTurn && isMyTurn) setHeld(null);
    wasMyTurnRef.current = isMyTurn;
  }, [isMyTurn, turn?.playerId]);

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
      ? `Beat or tie ${
          snapshot?.players.find((p) => p.id === rollToBeat.playerId)?.name ?? 'the leader'
        }'s ${describeScore(rollToBeat.score)} to stand`
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

  // Spectator fallback: committed dice shown at fixed slots (quaternionForFace)
  // when no pose stream arrived this turn — "dice appear" instead of tumble.
  const passiveDice: TableDiceProps | undefined =
    turn && !isMyTurn && turn.dice.length > 0
      ? {
          releaseSignal: 0,
          releaseVelocity: ZERO_VELOCITY,
          keepIndices: turn.keptIndices,
          dice: turn.dice,
          canDrag: false,
          active: true,
          onSettled: () => {},
          onRelease: () => {},
        }
      : undefined;

  return {
    /** Defined only for the active roller: full 3D roll wiring for `<Table dice>`. */
    tableDice,
    /** Spectator fallback display when the pose stream is absent. */
    passiveDice,
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
    heldPose: held?.frame ?? null,
    /** When heldPose was captured (0 when absent) — newest-wins in Room. */
    heldPoseAt: held?.at ?? 0,
  };
}
