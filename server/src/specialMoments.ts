import type { HandScore, RoomSettings, SpecialMomentKind, StraightKind } from '@dice/shared';
import { isClassicWin, isFirstRollYahtzee, isSpecialMomentEnabled } from '@dice/shared';

interface RollSpecialMomentInput {
  settings: RoomSettings;
  score: HandScore;
  straightKind: StraightKind;
  straightAwarded: boolean;
  classicWinEligible: boolean;
}

/** Special moments revealed when a normal roll clears its quiet window. */
export function specialMomentsForRoll(input: RollSpecialMomentInput): SpecialMomentKind[] {
  const hits: SpecialMomentKind[] = [];
  if (
    isSpecialMomentEnabled(input.settings, 'straight') &&
    input.straightAwarded &&
    input.straightKind !== 'none'
  ) {
    hits.push('straight');
  }
  if (
    isSpecialMomentEnabled(input.settings, 'classic') &&
    input.classicWinEligible &&
    isClassicWin(input.score)
  ) {
    hits.push('classic');
  }
  if (
    isSpecialMomentEnabled(input.settings, 'first-roll-yahtzee') &&
    isFirstRollYahtzee(input.score)
  ) {
    hits.push('first-roll-yahtzee');
  }
  return hits;
}

/** A literal bonus-die match is special even when every payer is broke. */
export function isYahtzeeBonusSpecialMoment(settings: RoomSettings, matched: boolean): boolean {
  return isSpecialMomentEnabled(settings, 'yahtzee-bonus') && matched;
}
