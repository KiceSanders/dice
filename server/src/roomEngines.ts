import { assertNever } from '@dice/shared';
import { GameEngine } from './engine.js';
import { BetALotEngine } from './games/betalot/engine.js';
import { handleBetALotEvent } from './games/betalot/roomBridge.js';
import { BlackjackEngine, type BlackjackEvent } from './games/blackjack/engine.js';
import type { Room } from './room.js';
import { handleEngineEvent } from './roomGameBridge.js';

function handleBlackjackEvent(room: Room, event: BlackjackEvent): void {
  switch (event.type) {
    case 'throwStarted':
      room.broadcast({ ...event, type: 'blackjack:throwStarted' });
      break;
    case 'rolled':
      room.broadcast({ ...event, type: 'blackjack:rolled' });
      break;
    case 'roundEnded':
      room.phase = 'roundEnd';
      room.broadcast({ ...event, type: 'blackjack:roundEnded' });
      break;
    case 'stateChanged':
      if (room.blackjackEngine?.phase === 'playing') room.phase = 'playing';
      break;
    case 'gameEnded':
      room.endGame();
      break;
    default:
      assertNever(event, 'unhandled blackjack event');
  }
  // Self-contained state includes decisions, settled dice, pending reveal and chip balances.
  room.recorder?.compact(room.buildPersistedState());
  room.broadcastState();
}

/** Game creation and event adapters live outside the membership/persistence room class. */
export function attachRoomEngine(room: Room): void {
  room.phase = 'playing';
  if (room.settings.kind === 'blackjack') {
    room.blackjackEngine = new BlackjackEngine(
      () => [...room.players.values()],
      room.settings,
      (event) => handleBlackjackEvent(room, event),
    );
    room.onForcedStand = (id) => room.blackjackEngine?.forceStand(id);
  } else if (room.settings.kind === 'betalot') {
    room.betALotEngine = new BetALotEngine(
      () => room.seatedPlayers(),
      room.settings,
      (event) =>
        handleBetALotEvent(event, {
          engine: () => room.betALotEngine,
          recorder: () => room.recorder,
          buildPersistedState: () => room.buildPersistedState(),
          broadcast: (msg) => room.broadcast(msg),
          broadcastState: () => room.broadcastState(),
          setPhase: (phase) => {
            room.phase = phase;
          },
          endGame: () => room.endGame(),
        }),
    );
    room.onForcedStand = (id) => room.betALotEngine?.forceStand(id);
  } else {
    room.engine = new GameEngine(
      () => room.seatedPlayers(),
      room.settings,
      (event) =>
        handleEngineEvent(event, {
          recorder: room.recorder,
          broadcast: (msg) => room.broadcast(msg),
          broadcastState: () => room.broadcastState(),
          setPhasePlaying: () => {
            room.phase = 'playing';
          },
          setPhaseRoundEnd: () => {
            room.phase = 'roundEnd';
          },
          compactAtRoundEnd: () => room.recorder?.compact(room.buildPersistedState()),
          endGame: () => room.endGame(),
          isEnginePlaying: () => room.engine?.phase === 'playing',
        }),
      room.engineOpts,
    );
    room.onForcedStand = (id) => room.engine?.forceStand(id);
  }
}
