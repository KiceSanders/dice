import type { AutoIncrementConfig, RoomSettings } from '../types.js';

/**
 * Caps for auto-raised amounts. Kept in sync with `clampSettings`
 * (server/src/room.ts) so a raised value survives a clamp round-trip
 * (persistence snapshots re-clamp settings on restore).
 */
const MAX_ANTE = 1000;
const MAX_BET_AMOUNT = 100_000;

/**
 * True when starting `roundNumber` crosses an auto-raise boundary
 * (docs/GAME_RULES.md "Stakes: multiplier and auto-raise"): every
 * `everyRounds` rounds after the first period, i.e. rounds
 * `everyRounds + 1`, `2 × everyRounds + 1`, ...
 */
export function shouldRaiseStakes(auto: AutoIncrementConfig, roundNumber: number): boolean {
  if (!auto.enabled || auto.everyRounds <= 0) return false;
  return roundNumber > 1 && (roundNumber - 1) % auto.everyRounds === 0;
}

/**
 * One auto-raise: multiply the ante and every instant side-bet amount by
 * `betMultiplier`, returning new settings. The raised values are written back
 * into the room settings so hosts see — and can manually re-edit — the live
 * amounts; the next raise builds on whatever is stored then. The Classic Pot
 * win is untouched (it always pays the whole accumulated pool).
 */
export function raiseStakes(settings: RoomSettings): RoomSettings {
  const factor = Math.max(1, Math.round(settings.betMultiplier));
  const cap = (value: number, max: number) => Math.min(Math.round(value * factor), max);
  return {
    ...settings,
    chipsPerRound: cap(settings.chipsPerRound, MAX_ANTE),
    straightPayout: {
      ...settings.straightPayout,
      amountPerPlayer: cap(settings.straightPayout.amountPerPlayer, MAX_BET_AMOUNT),
    },
    classicPot: {
      ...settings.classicPot,
      donationAmount: cap(settings.classicPot.donationAmount, MAX_BET_AMOUNT),
    },
    yahtzeeBonus: {
      ...settings.yahtzeeBonus,
      amountPerPlayer: cap(settings.yahtzeeBonus.amountPerPlayer, MAX_BET_AMOUNT),
    },
    firstRollYahtzeePayout: {
      ...settings.firstRollYahtzeePayout,
      amountPerPlayer: cap(settings.firstRollYahtzeePayout.amountPerPlayer, MAX_BET_AMOUNT),
    },
  };
}
