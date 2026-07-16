import type { FirstRollYahtzeePayoutConfig, HandScore, PlayerId } from '@dice/shared';
import { isFirstRollYahtzee } from '@dice/shared';

export interface PayoutPlayer {
  id: PlayerId;
  chips: number;
  seat: number | null;
}

export interface FirstRollYahtzeePayment {
  playerId: PlayerId;
  amountPerPlayer: number;
  total: number;
  payments: { playerId: PlayerId; amount: number }[];
}

/**
 * Applies the first-roll Yahtzee instant payout. Same payer-only cap as other
 * instant player-to-player bets: short payers pay what they have; short rollers
 * still collect in full. Stacks stay non-negative and zero-sum.
 */
export function applyFirstRollYahtzeePayout(
  config: FirstRollYahtzeePayoutConfig,
  score: HandScore,
  roller: PayoutPlayer | undefined,
  seated: PayoutPlayer[],
): FirstRollYahtzeePayment | null {
  if (!config.enabled || config.amountPerPlayer <= 0 || !roller || !isFirstRollYahtzee(score)) {
    return null;
  }

  const payments: { playerId: PlayerId; amount: number }[] = [];
  let total = 0;
  for (const payer of seated) {
    if (payer.id === roller.id || payer.seat === null) continue;
    const amount = Math.min(config.amountPerPlayer, payer.chips);
    payer.chips -= amount;
    total += amount;
    payments.push({ playerId: payer.id, amount });
  }
  roller.chips += total;

  return {
    playerId: roller.id,
    amountPerPlayer: config.amountPerPlayer,
    total,
    payments,
  };
}
