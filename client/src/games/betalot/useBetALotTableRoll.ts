import type { BetALotStatePublic, ClientMessage, Die, PoseFrame, RoomSnapshot } from '@dice/shared';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  FRAME_FLUSH_MS,
  FrameBatch,
  framesMessage,
  isValidPoseFrame,
  shouldFlushFrameBatch,
} from '../../game/throwProtocol';
import type { DiceCount } from '../../table3d/dice/constants';
import { resolveTableRestPose } from '../../table3d/dice/staticPose';
import type { TableDiceProps, ThrowVelocity } from '../../table3d/dice/types';
import { seatDisplayPlacement } from '../../table3d/layout';
import { poseFrameToCanonical } from '../../table3d/seatTransform';

const ZERO_VELOCITY: ThrowVelocity = { x: 0, y: 0, z: 0 };

export function shouldShowBetALotHeldPose(input: {
  hasHeldPose: boolean;
  extraRoll: boolean;
  throwing: boolean;
  dragging: boolean;
  rolling: boolean;
  localSimShowsLatestRoll: boolean;
}): boolean {
  return (
    input.hasHeldPose &&
    !input.extraRoll &&
    !input.throwing &&
    !input.dragging &&
    !input.rolling &&
    !input.localSimShowsLatestRoll
  );
}

/** Binds the shared koozie physics to Bet-a-lot's one-throw ladder protocol. */
export function useBetALotTableRoll(
  snapshot: RoomSnapshot | null,
  myId: string | null,
  send: (message: ClientMessage) => boolean,
  connected: boolean,
) {
  const [dragging, setDragging] = useState(false);
  const [rolling, setRolling] = useState(false);
  const [pointerOnTable, setPointerOnTable] = useState(false);
  const [releaseSignal, setReleaseSignal] = useState(0);
  const [releaseVelocity, setReleaseVelocity] = useState<ThrowVelocity>(ZERO_VELOCITY);
  const [frameBatch] = useState(() => new FrameBatch());
  const game =
    snapshot?.settings.kind === 'betalot' ? (snapshot.game as BetALotStatePublic | null) : null;
  const isMyTurn = game?.currentPlayerId === myId;
  const diceCount = (game?.currentDiceCount ?? 1) as DiceCount;
  const myDisplaySeat = snapshot?.players.find((player) => player.id === myId)?.seat ?? null;
  const mySeat = myDisplaySeat ?? 0;
  const activeSeat =
    snapshot?.players.find((player) => player.id === game?.currentPlayerId)?.seat ?? null;
  const occupiedSeats =
    snapshot?.players.flatMap((player) => (player.seat === null ? [] : [player.seat])) ?? [];
  const activePlacement =
    game && !isMyTurn && activeSeat !== null
      ? seatDisplayPlacement(occupiedSeats, myDisplaySeat, activeSeat)
      : null;
  const latestRoll = game?.ladder.at(-1) ?? null;
  const latestRollSeat =
    snapshot?.players.find((player) => player.id === latestRoll?.playerId)?.seat ?? null;
  const latestRollPlacement =
    latestRollSeat === null
      ? null
      : seatDisplayPlacement(occupiedSeats, myDisplaySeat, latestRollSeat);
  const heldPose = useMemo(() => {
    if (!latestRoll || !latestRollPlacement) return null;
    return resolveTableRestPose(
      {
        playerId: latestRoll.playerId,
        dice: latestRoll.dice,
        kept: [],
        restPose: latestRoll.restPose,
      },
      latestRollPlacement,
      latestRoll.dice.length as DiceCount,
    ).frame;
  }, [latestRoll, latestRollPlacement]);

  const flushFrames = useCallback(() => {
    frameBatch.clearTimer();
    const frames = frameBatch.take();
    if (frames.length) send(framesMessage(frames));
  }, [frameBatch, send]);

  useEffect(() => () => flushFrames(), [flushFrames]);

  const onRelease = useCallback(
    (velocity: ThrowVelocity) => {
      if (!game) return;
      setReleaseVelocity(velocity);
      setReleaseSignal((value) => value + 1);
      setRolling(true);
      send({ type: game.extraRoll ? 'betalot:extraThrowStart' : 'betalot:throwStart' });
    },
    [game, send],
  );

  const onSettled = useCallback(
    (dice: Die[], settleFrame: PoseFrame) => {
      setRolling(false);
      if (!game) return true;
      const canonical = poseFrameToCanonical(settleFrame, mySeat);
      const restPose = canonical.bodies.slice(1);
      if (game.extraRoll) {
        const die = dice[0];
        if (die !== undefined) {
          send({
            type: 'betalot:extraThrowResult',
            die,
            ...(restPose.length === 1 ? { restPose } : {}),
          });
        }
      } else {
        send({
          type: 'betalot:throwResult',
          dice,
          ...(restPose.length === dice.length ? { restPose } : {}),
        });
      }
      return true;
    },
    [game, mySeat, send],
  );

  const onPoseFrame = useCallback(
    (frame: PoseFrame) => {
      if (!isValidPoseFrame(frame)) return;
      const canonical = poseFrameToCanonical(frame, mySeat);
      const count = frameBatch.push(canonical);
      if (shouldFlushFrameBatch(count, canonical.cupVisible)) flushFrames();
      else frameBatch.scheduleFlush(flushFrames, FRAME_FLUSH_MS);
    },
    [flushFrames, frameBatch, mySeat],
  );

  const latestDice =
    !game?.extraRoll &&
    latestRoll?.playerId === myId &&
    latestRoll.dice.length === game?.currentDiceCount
      ? latestRoll.dice
      : [];
  const tableDice: TableDiceProps | undefined =
    game && isMyTurn
      ? {
          diceCount,
          keepIndices: [],
          dice: latestDice,
          active: true,
          releaseSignal,
          releaseVelocity,
          canDrag:
            connected &&
            !game.awaitingCall &&
            !game.throwing &&
            !game.resolving &&
            snapshot?.phase === 'playing',
          onSettled,
          onRelease,
          onRollingChange: setRolling,
          onDragChange: setDragging,
          onPoseFrame,
        }
      : undefined;
  const localSimShowsLatestRoll =
    tableDice !== undefined &&
    latestRoll?.playerId === myId &&
    latestRoll.dice.length === diceCount;

  return {
    tableDice,
    heldPose,
    heldDiceCount: (latestRoll?.dice.length ?? diceCount) as DiceCount,
    showHeldPose: shouldShowBetALotHeldPose({
      hasHeldPose: heldPose !== null,
      extraRoll: game?.extraRoll !== null && game?.extraRoll !== undefined,
      throwing: game?.throwing ?? false,
      dragging,
      rolling,
      localSimShowsLatestRoll,
    }),
    active: tableDice !== undefined,
    diceAiming: Boolean(pointerOnTable && isMyTurn && !rolling),
    onTablePointer: setPointerOnTable,
    parkedKoozieAngle: activePlacement?.angle ?? null,
    dragging,
    rolling,
  };
}
