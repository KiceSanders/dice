import type { RoomSettings } from '../types.js';

/**
 * Effective stake multiplier for a given round
 * (docs/GAME_RULES.md "Stakes: multiplier and auto-raise").
 *
 * Starts at `settings.betMultiplier` and, when auto-increment is enabled,
 * grows by another `betMultiplier` every `everyRounds` rounds — the base is
 * both the starting value and the step size. Rounds 1..N use base × 1, rounds
 * N+1..2N use base × 2, and so on. Multiplies the ante, straight payout,
 * classic pot donation, Yahtzee bonus, and first-roll Yahtzee payout.
 */
export function effectiveMultiplier(
  settings: Pick<RoomSettings, 'betMultiplier' | 'autoIncrement'>,
  roundNumber: number,
): number {
  const base = Math.max(1, Math.round(settings.betMultiplier));
  const { enabled, everyRounds } = settings.autoIncrement;
  if (!enabled || everyRounds <= 0 || roundNumber <= 1) return base;
  return base * (1 + Math.floor((roundNumber - 1) / everyRounds));
}
