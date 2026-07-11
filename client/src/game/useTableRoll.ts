import type { ClientMessage, Die, PoseFrame, RoomSnapshot } from '@dice/shared';
import { canStandVoluntarily } from '@dice/shared';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { TurnActions } from '../components/GameArea';
import { describeScore } from '../components/GameHud';
import type { TableDiceProps, ThrowVelocity } from '../table3d/dice/types';
import { displaySeatIndex } from '../table3d/layout';
import { poseFrameToCanonical } from '../table3d/seatTransform';
import {
  FRAME_FLUSH_MS,
  FrameBatch,
  framesMessage,
  isValidPoseFrame,
  restPoseForThrowResult,
  shouldFlushFrameBatch,
  standMessage,
  throwResultMessage,
  throwStartMessage,
} from './throwProtocol';
import { usePendingKeep } from './usePendingKeep';

const ZERO_VELOCITY: ThrowVelocity = { x: 0, y: 0, z: 0 };

function standHintFor(
  snapshot: RoomSnapshot,
  turn: NonNullable<RoomSnapshot['game']>['currentTurn'],
  canStand: boolean,
): string | undefined {
  const rollToBeat = snapshot.game?.rollToBeat ?? null;
  if (!turn || canStand || turn.rollsUsed <= 0 || !rollToBeat) return undefined;
  const names = rollToBeat.playerIds
    .map((id) => snapshot.players.find((p) => p.id === id)?.name)
    .filter((n): n is string => Boolean(n));
  const who = names.length === 0 ? "the leader's" : `${names.join(' / ')}'s`;
  return `Beat or tie ${who} ${describeScore(rollToBeat.score)} to stand`;
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
  const [dragging, setDragging] = useState(false);
  const [rolling, setRolling] = useState(false);
  const [pointerOnTable, setPointerOnTable] = useState(false);
  const [releaseSignal, setReleaseSignal] = useState(0);
  const [releaseVelocity, setReleaseVelocity] = useState<ThrowVelocity>(ZERO_VELOCITY);
  const [frameBatch] = useState(() => new FrameBatch());
  const latestCanonicalFrameRef = useRef<PoseFrame | null>(null);

  const turn = snapshot?.game?.currentTurn ?? null;
  const { pendingKeep, pendingKeepRef, toggleKeep } = usePendingKeep(turn, {
    onReset: () => {
      setDragging(false);
      setRolling(false);
    },
  });
  const isMyTurn = turn !== null && myId !== null && turn.playerId === myId;
  const turnRollsUsed = turn?.rollsUsed ?? 0;
  const mySeat = snapshot?.players.find((p) => p.id === myId)?.seat ?? 0;
  const activeSeat =
    turn !== null ? (snapshot?.players.find((p) => p.id === turn.playerId)?.seat ?? null) : null;
  const parkedKoozieDisplaySeat =
    snapshot?.phase === 'playing' && activeSeat !== null && !isMyTurn
      ? displaySeatIndex(activeSeat, mySeat)
      : null;

  const onRelease = useCallback(
    (velocity: ThrowVelocity) => {
      setReleaseVelocity(velocity);
      setReleaseSignal((s) => s + 1);
      setRolling(true);
      send(throwStartMessage(pendingKeepRef.current));
    },
    [send, pendingKeepRef],
  );

  const onSettled = useCallback(
    (dice: Die[], settleFrame: PoseFrame) => {
      setRolling(false);
      const canonical = poseFrameToCanonical(settleFrame, mySeat);
      send(throwResultMessage(dice, restPoseForThrowResult(canonical.bodies, dice)));
    },
    [send, mySeat],
  );

  const flushFrames = useCallback(() => {
    frameBatch.clearTimer();
    const frames = frameBatch.take();
    if (frames.length > 0) send(framesMessage(frames));
  }, [send, frameBatch]);

  const onPoseFrame = useCallback(
    (frame: PoseFrame) => {
      if (!isValidPoseFrame(frame)) return;
      const canonical = poseFrameToCanonical(frame, mySeat);
      latestCanonicalFrameRef.current = canonical;
      const length = frameBatch.push(canonical);
      if (shouldFlushFrameBatch(length, canonical.cupVisible)) flushFrames();
      else frameBatch.scheduleFlush(flushFrames, FRAME_FLUSH_MS);
    },
    [flushFrames, mySeat, frameBatch],
  );

  useEffect(() => () => flushFrames(), [flushFrames]);
  useEffect(() => {
    latestCanonicalFrameRef.current = null;
  }, [turn?.playerId, turn?.rollsUsed]);

  const onKeepToggle = useCallback(
    (index: number) => {
      if (!isMyTurn) return;
      return toggleKeep(index, turnRollsUsed > 0) ?? undefined;
    },
    [isMyTurn, toggleKeep, turnRollsUsed],
  );

  const canDrag = isMyTurn && connected && snapshot?.phase === 'playing';
  const tableDice: TableDiceProps | undefined =
    turn && isMyTurn
      ? {
          releaseSignal,
          releaseVelocity,
          keepIndices: pendingKeep,
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

  const rollToBeat = snapshot?.game?.rollToBeat ?? null;
  const canStand =
    turn !== null && canStandVoluntarily(turn.dice, turn.rollsUsed, rollToBeat?.score ?? null);
  const turnActions: TurnActions | undefined = tableDice
    ? {
        onStand: () => {
          const restPose =
            turn && latestCanonicalFrameRef.current
              ? restPoseForThrowResult(latestCanonicalFrameRef.current.bodies, turn.dice)
              : null;
          send(standMessage(restPose));
        },
        canStand,
        standHint: snapshot ? standHintFor(snapshot, turn, canStand) : undefined,
        disabled: rolling || !connected,
        aiming: dragging,
      }
    : undefined;

  return {
    tableDice,
    turnActions,
    pendingKeep,
    active: tableDice !== undefined,
    diceAiming: dragging || (pointerOnTable && isMyTurn && !rolling),
    onTablePointer: setPointerOnTable,
    rolling,
    dragging,
    parkedKoozieDisplaySeat,
  };
}
