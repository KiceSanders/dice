import {
  activeBlackjackState,
  type BlackjackStatePublic,
  DEFAULT_BETALOT_SETTINGS,
  type RoomSnapshot,
} from '@dice/shared';
import { expect, it } from 'vitest';
import { blackjackTableSnapshot } from './bonusSnapshot';

it('adapts the nested bonus for every table renderer while retaining room identity and chip balances', () => {
  const blackjack: BlackjackStatePublic = {
    kind: 'blackjack',
    bonus: { afterRound: 10, firePlayerId: null },
    roundNumber: 1,
    overtime: 1,
    dieSides: 12,
    payout: 20,
    openerId: 'a',
    currentPlayerId: 'a',
    turnNumber: 4,
    throwing: false,
    resolving: false,
    awaitingDecision: true,
    hands: [
      { playerId: 'a', dice: [12], total: 12, stood: false },
      { playerId: 'b', dice: [], total: 0, stood: false },
    ],
    tableDie: { playerId: 'a', die: 12, restPose: null },
    result: null,
  };
  const snapshot: RoomSnapshot = {
    roomId: 'BONUS',
    settings: DEFAULT_BETALOT_SETTINGS,
    phase: 'roundEnd',
    hostId: 'a',
    players: [],
    seatRequests: [],
    game: {
      kind: 'betalot',
      roundNumber: 10,
      sevensPot: 7,
      openerId: 'b',
      currentPlayerId: null,
      currentDiceCount: 2,
      awaitingCall: false,
      pendingCall: null,
      throwing: false,
      resolving: false,
      extraRoll: null,
      ladder: [],
      roundHistory: [],
      fire: [],
      slots: { tickets: ['a'], active: null },
      blackjack,
    },
  };
  const view = blackjackTableSnapshot(snapshot)!;
  expect(view.game).toBe(blackjack);
  expect(activeBlackjackState(snapshot.game)).toBe(blackjack);
  expect(view.phase).toBe('playing');
  expect(view.settings.kind).toBe('blackjack');
  expect(view.players).toBe(snapshot.players);
  expect(snapshot.settings.kind).toBe('betalot');
  expect(snapshot.phase).toBe('roundEnd');
  blackjack.result = { winnerId: 'a', loserId: 'b', amount: 20, reason: 'higher' };
  expect(blackjackTableSnapshot(snapshot)?.phase).toBe('roundEnd');
  if (snapshot.game && 'blackjack' in snapshot.game) snapshot.game.blackjack = null;
  expect(blackjackTableSnapshot(snapshot)).toBeNull();
  expect(activeBlackjackState(snapshot.game)).toBeNull();
});
