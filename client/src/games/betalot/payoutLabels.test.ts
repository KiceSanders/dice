import { describe, expect, it } from 'vitest';
import { formatBetALotPayoutNotice } from './payoutLabels';

describe('formatBetALotPayoutNotice', () => {
  it('labels a straight payout as a win for the recipient', () => {
    expect(formatBetALotPayoutNotice('straight', 5, 'a', 'b', 'b')).toBe('Straight win: payout 5');
  });

  it('labels a round loss as a loss for the payer', () => {
    expect(formatBetALotPayoutNotice('loss', 3, 'a', 'b', 'a')).toBe('Round loss: payout 3');
  });

  it('labels a sevens-pot contribution as a loss for the payer', () => {
    expect(formatBetALotPayoutNotice('sevenPot', 1, 'a', null, 'a')).toBe(
      'Sevens pot loss: payout 1',
    );
  });
});
