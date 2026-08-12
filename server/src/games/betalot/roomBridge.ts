import type { ServerMessage } from '@dice/shared';
import { assertNever } from '@dice/shared';
import type { PersistedRoomState, RoomRecorder } from '../../events.js';
import type { BetALotEngine, BetALotEvent } from './engine.js';

interface BetALotBridgeContext {
  engine: () => BetALotEngine | null;
  recorder: () => RoomRecorder | null;
  buildPersistedState: () => PersistedRoomState;
  broadcast: (message: ServerMessage) => void;
  broadcastState: () => void;
  setPhase: (phase: 'playing' | 'roundEnd') => void;
  endGame: () => void;
}

/** Bet-a-lot engine events → wire messages and compact recovery snapshots. */
export function handleBetALotEvent(event: BetALotEvent, ctx: BetALotBridgeContext): void {
  let compact = false;
  switch (event.type) {
    case 'throwStarted':
      ctx.broadcast({
        type: 'betalot:throwStarted',
        playerId: event.playerId,
        diceCount: event.diceCount,
        rung: event.rung,
        extra: event.extra,
      });
      break;
    case 'rolled':
      compact = true;
      ctx.broadcast({
        type: 'betalot:rolled',
        playerId: event.playerId,
        dice: event.dice,
        score: event.score,
        rung: event.rung,
        restPose: event.restPose,
      });
      break;
    case 'extraRolled':
      compact = true;
      ctx.broadcast({
        type: 'betalot:extraRolled',
        playerId: event.playerId,
        die: event.die,
        target: event.target,
        matched: event.matched,
        sourceDiceCount: event.sourceDiceCount,
        restPose: event.restPose,
      });
      break;
    case 'paid':
      ctx.broadcast({
        type: 'betalot:paid',
        fromPlayerId: event.fromPlayerId,
        toPlayerId: event.toPlayerId,
        amount: event.amount,
        reason: event.reason,
        sevensPot: event.sevensPot,
      });
      break;
    case 'roundEnded':
      compact = true;
      ctx.setPhase('roundEnd');
      ctx.broadcast({
        type: 'betalot:roundEnded',
        winnerId: event.winnerId,
        loserId: event.loserId,
        amount: event.amount,
      });
      break;
    case 'fireChanged':
      ctx.broadcast({ type: 'betalot:fireChanged', fire: event.fire });
      break;
    case 'stateChanged':
      compact = true;
      if (ctx.engine()?.phase === 'playing') ctx.setPhase('playing');
      break;
    case 'gameEnded':
      compact = true;
      ctx.endGame();
      break;
    default:
      assertNever(event, 'unhandled Bet-a-lot event');
  }

  // Bet-a-lot recovery uses a compact self-contained snapshot at every
  // authoritative transition instead of replaying a separate event vocabulary.
  if (compact) ctx.recorder()?.compact(ctx.buildPersistedState());
  ctx.broadcastState();
}
