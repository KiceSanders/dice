import type { BetALotSettings, Die } from '../../types.js';

export const BETALOT_MIN_DICE = 1;
export const BETALOT_MAX_DICE = 6;
export const BETALOT_ROUND_HISTORY_MAX = 10;

export function sumDice(dice: readonly Die[]): number {
  return dice.reduce((total, die) => total + die, 0);
}

/** Literal consecutive faces; one is never wild in Bet-a-lot. */
export function isStraight(dice: readonly Die[]): boolean {
  if (dice.length < 3 || dice.length > BETALOT_MAX_DICE) return false;
  const sorted = [...dice].sort((a, b) => a - b);
  return sorted.every((die, index) => index === 0 || die === sorted[index - 1]! + 1);
}

export function isAllSame(dice: readonly Die[]): boolean {
  return dice.length >= 2 && dice.every((die) => die === dice[0]);
}

/** Exactly three of one literal face and two of another. */
export function isFullHouse(dice: readonly Die[]): boolean {
  if (dice.length !== 5) return false;
  const counts = new Map<Die, number>();
  for (const die of dice) counts.set(die, (counts.get(die) ?? 0) + 1);
  const groups = [...counts.values()].sort((a, b) => a - b);
  return groups.length === 2 && groups[0] === 2 && groups[1] === 3;
}

export function lossPayoutForDiceCount(settings: BetALotSettings, diceCount: number): number {
  switch (diceCount) {
    case 2:
      return settings.lossPayouts.twoDice;
    case 3:
      return settings.lossPayouts.threeDice;
    case 4:
      return settings.lossPayouts.fourDice;
    case 5:
      return settings.lossPayouts.fiveDice;
    case 6:
      return settings.lossPayouts.sixDice;
    default:
      return 0;
  }
}

export function straightPayoutForDiceCount(settings: BetALotSettings, diceCount: number): number {
  switch (diceCount) {
    case 3:
      return settings.straightPayouts.threeDice;
    case 4:
      return settings.straightPayouts.fourDice;
    case 5:
      return settings.straightPayouts.fiveDice;
    case 6:
      return settings.straightPayouts.sixDice;
    default:
      return 0;
  }
}

export function allSamePayoutForDiceCount(settings: BetALotSettings, diceCount: number): number {
  switch (diceCount) {
    case 2:
      return settings.allSamePayouts.twoDice;
    case 3:
      return settings.allSamePayouts.threeDice;
    case 4:
      return settings.allSamePayouts.fourDice;
    case 5:
      return settings.allSamePayouts.fiveDice;
    case 6:
      return settings.allSamePayouts.sixDice;
    default:
      return 0;
  }
}

export function allSameExtraPayoutForDiceCount(
  settings: BetALotSettings,
  diceCount: number,
): number {
  switch (diceCount) {
    case 3:
      return settings.allSameExtraPayouts.threeDice;
    case 4:
      return settings.allSameExtraPayouts.fourDice;
    case 5:
      return settings.allSameExtraPayouts.fiveDice;
    case 6:
      return settings.allSameExtraPayouts.sixDice;
    default:
      return 0;
  }
}

export function overTwentyFivePayout(settings: BetALotSettings, total: number): number {
  return Math.max(0, total - 25) * settings.overTwentyFivePerPoint;
}

export function requiresExtraRoll(dice: readonly Die[]): boolean {
  return dice.length >= 3 && isAllSame(dice);
}

export function nextRungPlayer(openerId: string, opponentId: string, rung: number): string {
  return rung % 2 === 1 ? openerId : opponentId;
}

/** Consecutive round wins before Fire doubles opponent payments. */
export const BETALOT_FIRE_WINS = 3;

export function onFireAfterWin(streak: number): boolean {
  return streak >= BETALOT_FIRE_WINS;
}

/** Double opponent→on-fire transfers; the on-fire player's own payments are unchanged. */
export function firePaymentAmount(
  baseAmount: number,
  payerId: string,
  onFirePlayerId: string | null,
): number {
  if (!onFirePlayerId || onFirePlayerId === payerId) return baseAmount;
  return baseAmount * 2;
}
