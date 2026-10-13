import { describe, expect, it } from 'vitest';
import { redeemSlotTickets } from './tickets.js';

describe('slot ticket redemption', () => {
  it('requires two tickets belonging to the same player', () => {
    expect(redeemSlotTickets([])).toBeNull();
    expect(redeemSlotTickets(['a'])).toBeNull();
    expect(redeemSlotTickets(['a', 'b'])).toBeNull();
  });

  it('spends exactly two and preserves all other tickets', () => {
    const tickets = ['a', 'b', 'a', 'a'];
    expect(redeemSlotTickets(tickets)).toEqual({ playerId: 'a', tickets: ['b', 'a'] });
    expect(tickets).toEqual(['a', 'b', 'a', 'a']);
  });

  it('redeems the first completed pair even when another player has an older ticket', () => {
    expect(redeemSlotTickets(['a', 'b', 'b', 'a'])).toEqual({
      playerId: 'b',
      tickets: ['a', 'a'],
    });
  });
});
