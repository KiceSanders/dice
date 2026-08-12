import { describe, expect, it } from 'vitest';
import type { EnginePlayer } from '../../engine.js';
import { BetALotPayments } from './payments.js';

function makePayments(players: EnginePlayer[]) {
  const events: import('./payments.js').BetALotPaidEvent[] = [];
  const payments = new BetALotPayments(
    () => players,
    (playerId) => (playerId === 'a' ? 'b' : 'a'),
    (event) => events.push(event),
  );
  return { payments, players, events };
}

describe('BetALotPayments fire', () => {
  it('arms fire after three consecutive round wins', () => {
    const { payments } = makePayments([
      { id: 'a', chips: 100, seat: 0, connected: true },
      { id: 'b', chips: 100, seat: 1, connected: true },
    ]);

    expect(payments.updateFire('a', 'b').find((entry) => entry.playerId === 'a')).toMatchObject({
      streak: 1,
      onFire: false,
    });
    expect(payments.updateFire('a', 'b').find((entry) => entry.playerId === 'a')).toMatchObject({
      streak: 2,
      onFire: false,
    });
    expect(payments.updateFire('a', 'b').find((entry) => entry.playerId === 'a')).toMatchObject({
      streak: 3,
      onFire: true,
    });
  });

  it('clears fire and streak when the on-fire player loses', () => {
    const { payments } = makePayments([
      { id: 'a', chips: 100, seat: 0, connected: true },
      { id: 'b', chips: 100, seat: 1, connected: true },
    ]);

    payments.updateFire('a', 'b');
    payments.updateFire('a', 'b');
    payments.updateFire('a', 'b');
    const afterLoss = payments.updateFire('b', 'a');

    expect(afterLoss.find((entry) => entry.playerId === 'a')).toMatchObject({
      streak: 0,
      onFire: false,
    });
    expect(afterLoss.find((entry) => entry.playerId === 'b')).toMatchObject({
      streak: 1,
      onFire: false,
    });
  });

  it('doubles opponent payments to the on-fire player', () => {
    const players: EnginePlayer[] = [
      { id: 'a', chips: 100, seat: 0, connected: true },
      { id: 'b', chips: 100, seat: 1, connected: true },
    ];
    const { payments, events } = makePayments(players);

    payments.updateFire('a', 'b');
    payments.updateFire('a', 'b');
    payments.updateFire('a', 'b');
    payments.pay('b', 'a', 5, 'loss');

    expect(players[0]?.chips).toBe(110);
    expect(players[1]?.chips).toBe(90);
    expect(events.at(-1)).toMatchObject({ amount: 10, reason: 'loss' });
  });
});
