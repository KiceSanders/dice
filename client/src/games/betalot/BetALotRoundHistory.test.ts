import { describe, expect, it } from 'vitest';
import { BETALOT_HISTORY_COLORS } from './BetALotRoundHistory';

describe('Bet-a-lot history columns', () => {
  it('assigns blue and red by displayed player column, not logical seat number', () => {
    expect(BETALOT_HISTORY_COLORS).toEqual([
      'betalot-history-dot--blue',
      'betalot-history-dot--red',
    ]);
  });
});
