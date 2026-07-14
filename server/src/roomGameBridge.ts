import type { ServerMessage } from '@dice/shared';
import { assertNever } from '@dice/shared';
import type { EngineEvent } from './engine.js';
import type { RoomRecorder } from './events.js';

/**
 * Side effects the room provides when bridging engine events to the wire and
 * the persistence log. Keeps Room's engine callback as a thin dispatcher.
 */
export interface EngineBridgeContext {
  recorder: RoomRecorder | null;
  broadcast: (msg: ServerMessage) => void;
  broadcastState: () => void;
  setPhasePlaying: () => void;
  setPhaseRoundEnd: () => void;
  compactAtRoundEnd: () => void;
  endGame: () => void;
  isEnginePlaying: () => boolean;
}

/**
 * Map an EngineEvent onto persistence + ServerMessage broadcasts.
 * Compile error in the default branch = a new EngineEvent is unwired.
 */
export function handleEngineEvent(event: EngineEvent, ctx: EngineBridgeContext): void {
  switch (event.type) {
    case 'roundStarted':
      ctx.recorder?.append({
        type: 'roundStarted',
        roundNumber: event.roundNumber,
        antes: event.antes,
      });
      ctx.broadcast({
        type: 'round:started',
        roundNumber: event.roundNumber,
        antes: event.antes,
      });
      break;
    case 'throwStarted':
      // Not recorded: replay only needs the final values (the 'rolled' event).
      ctx.broadcast({
        type: 'turn:throwStarted',
        playerId: event.playerId,
        kept: event.kept,
        rollNumber: event.rollNumber,
      });
      break;
    case 'rolled':
      ctx.recorder?.append({
        type: 'rolled',
        playerId: event.playerId,
        dice: event.dice,
        kept: event.kept,
        rollNumber: event.rollNumber,
        restPose: event.restPose ?? undefined,
      });
      ctx.broadcast({
        type: 'turn:rolled',
        playerId: event.playerId,
        dice: event.dice,
        rollNumber: event.rollNumber,
        kept: event.kept,
        restPose: event.restPose,
      });
      ctx.broadcastState();
      break;
    case 'stood':
      ctx.recorder?.append({
        type: 'stood',
        playerId: event.playerId,
        dice: event.dice,
        score: event.score,
        restPose: event.restPose ?? undefined,
      });
      break;
    case 'forfeited':
      ctx.recorder?.append({ type: 'forfeited', playerId: event.playerId });
      ctx.broadcast({ type: 'turn:forfeited', playerId: event.playerId });
      break;
    case 'subRoundStarted':
      ctx.recorder?.append({
        type: 'subRoundStarted',
        depth: event.depth,
        participantIds: event.tiedPlayerIds,
        anteAmount: event.anteAmount,
        antes: event.antes,
      });
      ctx.broadcast({
        type: 'subround:started',
        tiedPlayerIds: event.tiedPlayerIds,
        anteAmount: event.anteAmount,
        depth: event.depth,
        antes: event.antes,
      });
      break;
    case 'straightPaid':
      ctx.recorder?.append({
        type: 'straightPaid',
        playerId: event.playerId,
        kind: event.kind,
        amountPerPlayer: event.amountPerPlayer,
        total: event.total,
        payments: event.payments,
      });
      ctx.broadcast({
        type: 'straight:paid',
        playerId: event.playerId,
        kind: event.kind,
        amountPerPlayer: event.amountPerPlayer,
        total: event.total,
        payments: event.payments,
      });
      break;
    case 'classicDonated':
      ctx.recorder?.append({
        type: 'classicDonated',
        playerId: event.playerId,
        amount: event.amount,
        classicPot: event.classicPot,
      });
      ctx.broadcast({
        type: 'classic:donated',
        playerId: event.playerId,
        amount: event.amount,
        classicPot: event.classicPot,
      });
      break;
    case 'classicWon':
      ctx.recorder?.append({
        type: 'classicWon',
        playerId: event.playerId,
        amount: event.amount,
      });
      ctx.broadcast({
        type: 'classic:won',
        playerId: event.playerId,
        amount: event.amount,
      });
      break;
    case 'bonusOffered':
      // Not recorded: replaying the quint 'rolled' re-offers deterministically.
      ctx.broadcast({
        type: 'turn:bonusOffered',
        playerId: event.playerId,
        face: event.face,
      });
      break;
    case 'bonusThrowStarted':
      // Not recorded: replay only needs the final die (the 'bonusRolled' event).
      ctx.broadcast({
        type: 'turn:bonusThrowStarted',
        playerId: event.playerId,
      });
      break;
    case 'bonusRolled':
      ctx.recorder?.append({
        type: 'bonusRolled',
        playerId: event.playerId,
        die: event.die,
      });
      ctx.broadcast({
        type: 'turn:bonusRolled',
        playerId: event.playerId,
        die: event.die,
        face: event.face,
        matched: event.matched,
      });
      ctx.broadcastState();
      break;
    case 'yahtzeeBonusPaid':
      ctx.recorder?.append({
        type: 'yahtzeeBonusPaid',
        playerId: event.playerId,
        amountPerPlayer: event.amountPerPlayer,
        total: event.total,
        payments: event.payments,
      });
      ctx.broadcast({
        type: 'yahtzee:paid',
        playerId: event.playerId,
        amountPerPlayer: event.amountPerPlayer,
        total: event.total,
        payments: event.payments,
      });
      break;
    case 'roundEnded':
      ctx.setPhaseRoundEnd();
      ctx.recorder?.append({
        type: 'roundEnded',
        winnerId: event.winnerId,
        potWon: event.potWon,
      });
      ctx.compactAtRoundEnd();
      ctx.broadcast({
        type: 'round:ended',
        winnerId: event.winnerId,
        potWon: event.potWon,
        scores: event.scores,
      });
      ctx.broadcastState();
      break;
    case 'stateChanged':
      if (ctx.isEnginePlaying()) ctx.setPhasePlaying();
      ctx.broadcastState();
      break;
    case 'gameEnded':
      ctx.recorder?.append({ type: 'gameEnded', reason: event.reason });
      ctx.endGame();
      ctx.broadcastState();
      break;
    default:
      assertNever(event, 'unhandled EngineEvent');
  }
}
