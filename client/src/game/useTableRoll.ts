import { useCallback, useEffect, useRef, useState } from 'react';
import type { ClientMessage, Die, PoseFrame, RoomSnapshot } from '@dice/shared';
import type { TurnActions } from '../components/GameArea';
import type { TableDiceProps, ThrowVelocity } from '../table3d/dice/types';
import { togglePendingKeep } from './keepSelection';

const ZERO_VELOCITY: ThrowVelocity = { x: 0, y: 0, z: 0 };

/** Batch pose frames so a 20 Hz sample rate costs ~10 messages/s on the wire. */
const FRAMES_PER_MESSAGE = 2;
const FRAME_FLUSH_MS = 200;

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

  const turn = snapshot?.game?.currentTurn ?? null;
  const isMyTurn = turn !== null && myId !== null && turn.playerId === myId;

  // New roll confirmed or turn changed: sync selection to the server's locked
  // keeps and drop any stale interaction state.
  useEffect(() => {
    setPendingKeep(turn ? [...turn.keptIndices] : []);
    setDragging(false);
    setRolling(false);
  }, [turn?.playerId, turn?.rollsUsed]); // eslint-disable-line react-hooks/exhaustive-deps

  const onRelease = useCallback(
    (velocity: ThrowVelocity) => {
      setReleaseVelocity(velocity);
      setReleaseSignal((s) => s + 1);
      setRolling(true);
      send({ type: 'turn:throwStart', keepIndices: pendingKeep });
    },
    [send, pendingKeep],
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
      frameBufRef.current.push(frame);
      if (frameBufRef.current.length >= FRAMES_PER_MESSAGE) flushFrames();
      else if (flushTimerRef.current === null) {
        flushTimerRef.current = window.setTimeout(flushFrames, FRAME_FLUSH_MS);
      }
    },
    [flushFrames],
  );

  useEffect(() => () => flushFrames(), [flushFrames]);

  const onKeepToggle = useCallback(
    (index: number) => {
      if (!turn || !isMyTurn) return;
      const next = togglePendingKeep(index, pendingKeep, turn.keptIndices, turn.rollsUsed > 0);
      if (next) setPendingKeep(next);
    },
    [turn, isMyTurn, pendingKeep],
  );

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

  // Keeping all five dice is a stand: the hand is already final.
  const turnActions: TurnActions | undefined = tableDice
    ? {
        onStand: () => send({ type: 'turn:stand' }),
        onKeepAllStand: () => send({ type: 'turn:stand' }),
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
    setPendingKeep,
    /** True while this client's 3D roll owns the dice display (hide 2D dice). */
    active: tableDice !== undefined,
    diceAiming: dragging || (pointerOnTable && isMyTurn && !rolling),
    onTablePointer,
    rolling,
  };
}
