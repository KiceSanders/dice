import type { Die } from '@dice/shared';
import { scoreHand, yahtzeeBonusTarget } from '@dice/shared';

/**
 * Conditions known at local settlement that will make the server lock the cup.
 * Kept in sync with GameEngine.settleRoll so DicePhysics never renders a
 * transient docked koozie while waiting for the authoritative snapshot.
 */
export function shouldLockKoozieAfterSettledRoll(
  dice: Die[],
  rollNumber: number,
  rollCap: number,
  yahtzeeBonusEnabled: boolean,
): boolean {
  if (rollNumber >= rollCap) return true;
  return yahtzeeBonusEnabled && yahtzeeBonusTarget(scoreHand(dice, rollNumber)) !== null;
}
