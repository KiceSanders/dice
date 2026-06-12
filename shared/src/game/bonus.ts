import type { StraightBonusConfig, StraightKind } from '../types.js';

/**
 * Straight bonus payout (PLAN.md): base → big-straight multiplier →
 * incremental streak scaling → maxBonus cap, in that order.
 * `streakLength` counts this straight (so the first straight is streak 1).
 */
export function calcStraightBonus(
  config: StraightBonusConfig,
  kind: Exclude<StraightKind, 'none'>,
  streakLength: number,
): number {
  if (!config.enabled) return 0;
  if (!Number.isInteger(streakLength) || streakLength < 1) {
    throw new Error(`invalid streakLength: ${streakLength}`);
  }

  let payout = config.baseAmount;
  if (kind === 'big') payout *= config.multiplier;
  if (config.incremental) payout *= streakLength;

  return Math.max(0, Math.min(payout, config.maxBonus));
}
