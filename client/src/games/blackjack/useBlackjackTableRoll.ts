import {
  type ClientMessage,
  isBlackjackState,
  type PoseFrame,
  type RoomSnapshot,
} from '@dice/shared';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  FRAME_FLUSH_MS,
  FrameBatch,
  framesMessage,
  isValidPoseFrame,
  shouldFlushFrameBatch,
} from '../../game/throwProtocol';
import { resolveTableRestPose } from '../../table3d/dice/staticPose';
import type { TableDiceProps, ThrowVelocity } from '../../table3d/dice/types';
import { seatDisplayPlacement } from '../../table3d/layout';
import { poseFrameToCanonical } from '../../table3d/seatTransform';

export function useBlackjackTableRoll(
  snapshot: RoomSnapshot | null,
  myId: string | null,
  send: (message: ClientMessage) => boolean,
  connected: boolean,
) {
  const game = isBlackjackState(snapshot?.game) ? snapshot.game : null;
  const [dragging, setDragging] = useState(false);
  const [rolling, setRolling] = useState(false);
  const [frameBatch] = useState(() => new FrameBatch());
  const settled = useRef(false);
  const mySeat = snapshot?.players.find((p) => p.id === myId)?.seat ?? null;
  const activeSeat = snapshot?.players.find((p) => p.id === game?.currentPlayerId)?.seat ?? null;
  const occupied = snapshot?.players.flatMap((p) => (p.seat === null ? [] : [p.seat])) ?? [];
  const isMyTurn = game?.currentPlayerId === myId;
  const rollKey = game ? `${game.roundNumber}-${game.overtime}-${game.turnNumber}` : '';
  useEffect(() => {
    settled.current = false;
    setDragging(false);
    setRolling(false);
    frameBatch.take();
  }, [rollKey, frameBatch]);
  const flush = useCallback(() => {
    frameBatch.clearTimer();
    const frames = frameBatch.take();
    if (frames.length) send(framesMessage(frames));
  }, [frameBatch, send]);
  useEffect(
    () => () => {
      frameBatch.clearTimer();
      frameBatch.take();
    },
    [frameBatch],
  );
  const onPoseFrame = useCallback(
    (frame: PoseFrame) => {
      if (settled.current || !isValidPoseFrame(frame)) return;
      const canonical = poseFrameToCanonical(frame, mySeat ?? 0);
      const count = frameBatch.push(canonical);
      if (shouldFlushFrameBatch(count, canonical.cupVisible)) flush();
      else frameBatch.scheduleFlush(flush, FRAME_FLUSH_MS);
    },
    [frameBatch, flush, mySeat],
  );
  const onSettled = useCallback(
    (dice: number[], frame: PoseFrame) => {
      if (settled.current) return true;
      settled.current = true;
      flush();
      setRolling(false);
      const die = dice[0];
      if (die !== undefined)
        send({
          type: 'blackjack:throwResult',
          die,
          restPose: poseFrameToCanonical(frame, mySeat ?? 0).bodies.slice(1),
        });
      return true;
    },
    [flush, send, mySeat],
  );
  const onRelease = useCallback(
    (_velocity: ThrowVelocity) => {
      setRolling(true);
      send({ type: 'blackjack:throwStart' });
    },
    [send],
  );
  // Once the die is authoritative, unmount local physics and use the one shared rest-pose resolver.
  const tableDice: TableDiceProps | undefined =
    game && isMyTurn && !game.tableDie && snapshot?.phase === 'playing'
      ? {
          diceCount: 1,
          dieSides: game.dieSides,
          rollKey,
          dice: [],
          keepIndices: [],
          active: true,
          releaseSignal: 0,
          releaseVelocity: { x: 0, y: 0, z: 0 },
          canDrag: connected && !game.throwing && !game.resolving && !game.awaitingDecision,
          onRelease,
          onSettled,
          onPoseFrame,
          onDragChange: setDragging,
          onRollingChange: setRolling,
        }
      : undefined;
  const tableDie = game?.tableDie;
  const heldPose = useMemo(() => {
    if (!tableDie || !snapshot) return null;
    const seat = snapshot.players.find((p) => p.id === tableDie.playerId)?.seat;
    if (seat == null) return null;
    const seats = snapshot.players.flatMap((p) => (p.seat === null ? [] : [p.seat]));
    const placement = seatDisplayPlacement(seats, mySeat, seat);
    return placement
      ? resolveTableRestPose(
          { ...tableDie, dice: [tableDie.die], kept: [] },
          placement,
          1,
          game.dieSides,
        ).frame
      : null;
  }, [tableDie, snapshot, mySeat, game?.dieSides]);
  const activePlacement =
    activeSeat === null ? null : seatDisplayPlacement(occupied, mySeat, activeSeat);
  return {
    tableDice,
    heldPose,
    dragging,
    rolling,
    parkedKoozieAngle:
      game && !isMyTurn && !game.tableDie && !game.throwing
        ? (activePlacement?.angle ?? null)
        : null,
  };
}
