import type { ClientMessage, RoomSnapshot } from '@dice/shared';
import { detectStraight } from '@dice/shared';
import { useEffect, useMemo, useRef } from 'react';
import type {
  AnteInfo,
  ClassicDonateInfo,
  ClassicWinInfo,
  LastRoll,
  RoundEndInfo,
  TransferInfo,
} from '../state/store';
import { pickHeldRollInput, resolveTableRestPose } from '../table3d/dice/staticPose';
import { tableEvents } from '../table3d/tableEvents';
import type { WsClient } from '../ws/client';
import { useRemoteRoll } from './useRemoteRoll';
import { useTableRoll } from './useTableRoll';

/**
 * Pose + remote feed + roll3d wiring for the live table (Room page).
 */
export function useTableScene(
  snapshot: RoomSnapshot | null,
  myId: string | null,
  lastRoll: LastRoll | null,
  send: (msg: ClientMessage) => boolean,
  connected: boolean,
  ws: WsClient,
) {
  const roll3d = useTableRoll(snapshot, myId, send, connected);
  const remoteRoll = useRemoteRoll(ws, snapshot, myId);
  const mySeatForPose = snapshot?.players.find((p) => p.id === myId)?.seat ?? 0;
  const heldPose = useMemo(() => {
    const input = pickHeldRollInput(lastRoll, snapshot?.game ?? null);
    return input ? resolveTableRestPose(input, mySeatForPose).frame : null;
  }, [lastRoll, snapshot?.game, mySeatForPose]);

  useEffect(() => {
    if (!lastRoll || detectStraight(lastRoll.dice) === 'none') return;
    tableEvents.emit({ type: 'straight', dice: lastRoll.dice }, lastRoll.receivedAt);
  }, [lastRoll]);

  const turn = snapshot?.game?.currentTurn ?? null;
  const inGame = snapshot !== null && snapshot.phase !== 'lobby' && snapshot.game !== null;
  const isMyTurn = turn !== null && myId !== null && turn.playerId === myId;
  const localSimShowsLastRoll =
    roll3d.tableDice !== undefined &&
    isMyTurn &&
    turn !== null &&
    turn.rollsUsed > 0 &&
    lastRoll?.playerId === myId &&
    lastRoll.rollNumber === turn.rollsUsed;
  const showHeldPose =
    Boolean(inGame) &&
    heldPose !== null &&
    !remoteRoll.live &&
    !turn?.throwing &&
    !roll3d.dragging &&
    !roll3d.rolling &&
    !localSimShowsLastRoll;

  const standControl =
    roll3d.turnActions && turn && turn.rollsUsed > 0 && !roll3d.dragging
      ? {
          onStand: roll3d.turnActions.onStand,
          canStand: roll3d.turnActions.canStand ?? true,
          hint: roll3d.turnActions.standHint,
          disabled: roll3d.turnActions.disabled,
        }
      : undefined;

  return {
    roll3d,
    remoteRoll,
    heldPose,
    showHeldPose,
    standControl,
    inGame,
    turn,
  };
}

/**
 * Emit ante / transfer / pot-award / classic-pot table events from reducer-captured payloads.
 * potBefore is stamped at message time in the store (TABLE_UI.md race note).
 */
export function useTableChipEvents(
  lastAnte: AnteInfo | null,
  lastTransfer: TransferInfo | null,
  roundEnd: RoundEndInfo | null,
  lastClassicDonate: ClassicDonateInfo | null = null,
  lastClassicWin: ClassicWinInfo | null = null,
) {
  const emittedAnteAtRef = useRef<number | null>(null);
  const emittedAwardAtRef = useRef<number | null>(null);
  const emittedTransferAtRef = useRef<number | null>(null);
  const emittedClassicDonateAtRef = useRef<number | null>(null);
  const emittedClassicWinAtRef = useRef<number | null>(null);

  useEffect(() => {
    const ante = lastAnte;
    if (!ante || emittedAnteAtRef.current === ante.receivedAt) return;
    emittedAnteAtRef.current = ante.receivedAt;
    const contributions = ante.contributions.filter((entry) => entry.amount > 0);
    if (contributions.length === 0) return;
    tableEvents.emit(
      {
        type: 'chips-to-pot',
        contributions,
        potBefore: ante.potBefore,
      },
      ante.receivedAt,
    );
  }, [lastAnte]);

  useEffect(() => {
    const transfer = lastTransfer;
    if (!transfer || emittedTransferAtRef.current === transfer.receivedAt) return;
    emittedTransferAtRef.current = transfer.receivedAt;
    const payments = transfer.payments.filter((entry) => entry.amount > 0);
    if (payments.length === 0) return;
    tableEvents.emit(
      {
        type: 'chips-between-players',
        toPlayerId: transfer.toPlayerId,
        payments,
      },
      transfer.receivedAt,
    );
  }, [lastTransfer]);

  useEffect(() => {
    if (!roundEnd?.winnerId || roundEnd.potWon <= 0) return;
    if (emittedAwardAtRef.current === roundEnd.receivedAt) return;
    emittedAwardAtRef.current = roundEnd.receivedAt;
    tableEvents.emit(
      {
        type: 'pot-to-winner',
        winnerId: roundEnd.winnerId,
        amount: roundEnd.potWon,
      },
      roundEnd.receivedAt,
    );
  }, [roundEnd]);

  useEffect(() => {
    const donate = lastClassicDonate;
    if (!donate || emittedClassicDonateAtRef.current === donate.receivedAt) return;
    emittedClassicDonateAtRef.current = donate.receivedAt;
    if (donate.amount <= 0) return;
    tableEvents.emit(
      {
        type: 'chips-to-classic-pot',
        playerId: donate.playerId,
        amount: donate.amount,
        classicPotBefore: donate.classicPotBefore,
      },
      donate.receivedAt,
    );
  }, [lastClassicDonate]);

  useEffect(() => {
    const win = lastClassicWin;
    if (!win || emittedClassicWinAtRef.current === win.receivedAt) return;
    emittedClassicWinAtRef.current = win.receivedAt;
    if (win.amount <= 0) return;
    tableEvents.emit(
      {
        type: 'classic-pot-to-winner',
        winnerId: win.playerId,
        amount: win.amount,
      },
      win.receivedAt,
    );
  }, [lastClassicWin]);
}
