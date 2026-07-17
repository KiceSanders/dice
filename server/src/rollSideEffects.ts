import type { ClassicPotConfig, HandScore, PlayerId } from '@dice/shared';
import { isClassicDonation, isClassicWin } from '@dice/shared';

export interface ChipPlayer {
  id: PlayerId;
  chips: number;
}

/** Mutate one zero-sum payer-to-roller transfer and return its wire payload. */
export function collectSidePayment(
  roller: ChipPlayer,
  seated: ChipPlayer[],
  amountPerPlayer: number,
): { total: number; payments: { playerId: PlayerId; amount: number }[] } {
  const payments: { playerId: PlayerId; amount: number }[] = [];
  let total = 0;
  for (const payer of seated) {
    if (payer.id === roller.id) continue;
    const paid = Math.min(amountPerPlayer, payer.chips);
    payer.chips -= paid;
    total += paid;
    payments.push({ playerId: payer.id, amount: paid });
  }
  roller.chips += total;
  return { total, payments };
}

export function donateToClassicPot(
  config: ClassicPotConfig,
  score: HandScore,
  roller: ChipPlayer,
  classicPot: number,
): { amount: number; classicPot: number } | null {
  if (!config.enabled || config.donationAmount <= 0 || !isClassicDonation(score)) return null;
  const amount = Math.min(config.donationAmount, roller.chips);
  if (amount <= 0) return null;
  roller.chips -= amount;
  return { amount, classicPot: classicPot + amount };
}

export function winClassicPot(
  config: ClassicPotConfig,
  score: HandScore,
  roller: ChipPlayer,
  classicPot: number,
): { amount: number } | null {
  if (!config.enabled || classicPot <= 0 || !isClassicWin(score)) return null;
  roller.chips += classicPot;
  return { amount: classicPot };
}
