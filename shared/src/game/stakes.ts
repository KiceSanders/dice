import type { RoomSettings } from '../types.js';

type StakeSettings = Pick<RoomSettings, 'betMultiplier' | 'autoIncrement'>;

/** True when starting this round applies another auto-raise step. */
export function isAutoRaiseRound(settings: StakeSettings, roundNumber: number): boolean {
  const { enabled, everyRounds } = settings.autoIncrement;
  return enabled && everyRounds > 0 && roundNumber > 1 && (roundNumber - 1) % everyRounds === 0;
}

/**
 * Resolve one configured stake amount for a round.
 *
 * The multiplier scales the starting amount. Each completed auto-raise period
 * then adds one more multiplier-sized step to that amount:
 * `(configuredAmount + completedPeriods) * betMultiplier`.
 */
export function effectiveStakeAmount(
  configuredAmount: number,
  settings: StakeSettings,
  roundNumber: number,
): number {
  const amount = Math.max(0, Math.round(configuredAmount));
  const multiplier = Math.max(1, Math.round(settings.betMultiplier));
  const { enabled, everyRounds } = settings.autoIncrement;
  const completedPeriods =
    enabled && everyRounds > 0 && roundNumber > 1 ? Math.floor((roundNumber - 1) / everyRounds) : 0;
  return (amount + completedPeriods) * multiplier;
}
