import type {
  AutoIncrementConfig,
  BetALotSettings,
  ClassicPotConfig,
  FirstRollYahtzeePayoutConfig,
  GameSettings,
  RoomSettings,
  StraightPayoutConfig,
  YahtzeeBonusConfig,
} from '@dice/shared';
import { DEFAULT_BETALOT_SETTINGS, DEFAULT_SETTINGS } from '@dice/shared';

const clampInt = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, Math.round(value)));

function clampBetALotSettings(settings: BetALotSettings): BetALotSettings {
  const base = DEFAULT_BETALOT_SETTINGS;
  const clampPayout = (value: number | undefined, fallback: number) =>
    clampInt(value ?? fallback, 0, 100_000);
  const minBuyIn = clampInt(settings.minBuyIn, 1, 1_000_000);
  return {
    kind: 'betalot',
    afterRollDelayMs: clampInt(settings.afterRollDelayMs ?? base.afterRollDelayMs, 0, 10_000),
    minBuyIn,
    maxBuyIn: clampInt(settings.maxBuyIn, minBuyIn, 10_000_000),
    callPayout: clampPayout(settings.callPayout, base.callPayout),
    openingOnePenalty: clampPayout(settings.openingOnePenalty, base.openingOnePenalty),
    lossPayouts: {
      twoDice: clampPayout(settings.lossPayouts?.twoDice, base.lossPayouts.twoDice),
      threeDice: clampPayout(settings.lossPayouts?.threeDice, base.lossPayouts.threeDice),
      fourDice: clampPayout(settings.lossPayouts?.fourDice, base.lossPayouts.fourDice),
      fiveDice: clampPayout(settings.lossPayouts?.fiveDice, base.lossPayouts.fiveDice),
      sixDice: clampPayout(settings.lossPayouts?.sixDice, base.lossPayouts.sixDice),
    },
    successfulRungSixPayout: clampPayout(
      settings.successfulRungSixPayout,
      base.successfulRungSixPayout,
    ),
    straightPayouts: {
      threeDice: clampPayout(settings.straightPayouts?.threeDice, base.straightPayouts.threeDice),
      fourDice: clampPayout(settings.straightPayouts?.fourDice, base.straightPayouts.fourDice),
      fiveDice: clampPayout(settings.straightPayouts?.fiveDice, base.straightPayouts.fiveDice),
      sixDice: clampPayout(settings.straightPayouts?.sixDice, base.straightPayouts.sixDice),
    },
    allSamePayouts: {
      twoDice: clampPayout(settings.allSamePayouts?.twoDice, base.allSamePayouts.twoDice),
      threeDice: clampPayout(settings.allSamePayouts?.threeDice, base.allSamePayouts.threeDice),
      fourDice: clampPayout(settings.allSamePayouts?.fourDice, base.allSamePayouts.fourDice),
      fiveDice: clampPayout(settings.allSamePayouts?.fiveDice, base.allSamePayouts.fiveDice),
      sixDice: clampPayout(settings.allSamePayouts?.sixDice, base.allSamePayouts.sixDice),
    },
    allSameExtraPayouts: {
      threeDice: clampPayout(
        settings.allSameExtraPayouts?.threeDice,
        base.allSameExtraPayouts.threeDice,
      ),
      fourDice: clampPayout(
        settings.allSameExtraPayouts?.fourDice,
        base.allSameExtraPayouts.fourDice,
      ),
      fiveDice: clampPayout(
        settings.allSameExtraPayouts?.fiveDice,
        base.allSameExtraPayouts.fiveDice,
      ),
      sixDice: clampPayout(settings.allSameExtraPayouts?.sixDice, base.allSameExtraPayouts.sixDice),
    },
    fullHousePayout: clampPayout(settings.fullHousePayout, base.fullHousePayout),
    sevenOpponentPayout: clampPayout(settings.sevenOpponentPayout, base.sevenOpponentPayout),
    sevenPotContribution: clampPayout(settings.sevenPotContribution, base.sevenPotContribution),
    overTwentyFivePerPoint: clampPayout(
      settings.overTwentyFivePerPoint,
      base.overTwentyFivePerPoint,
    ),
  };
}

export function clampSettings(settings: BetALotSettings): BetALotSettings;
export function clampSettings(settings: RoomSettings): RoomSettings;
export function clampSettings(settings: GameSettings): GameSettings;
export function clampSettings(settings: GameSettings): GameSettings {
  if (settings.kind === 'betalot') return clampBetALotSettings(settings);
  const minBuyIn = clampInt(settings.minBuyIn, 1, 1_000_000);
  const straight: Partial<StraightPayoutConfig> = settings.straightPayout ?? {};
  const classic: Partial<ClassicPotConfig> = settings.classicPot ?? {};
  const bonus: Partial<YahtzeeBonusConfig> = settings.yahtzeeBonus ?? {};
  const firstRoll: Partial<FirstRollYahtzeePayoutConfig> = settings.firstRollYahtzeePayout ?? {};
  const increment: Partial<AutoIncrementConfig> = settings.autoIncrement ?? {};
  return {
    chipsPerRound: clampInt(settings.chipsPerRound, 1, 1000),
    betMultiplier: clampInt(settings.betMultiplier ?? DEFAULT_SETTINGS.betMultiplier, 1, 1000),
    autoIncrement: {
      enabled:
        increment.enabled === undefined
          ? DEFAULT_SETTINGS.autoIncrement.enabled
          : Boolean(increment.enabled),
      everyRounds: clampInt(
        increment.everyRounds ?? DEFAULT_SETTINGS.autoIncrement.everyRounds,
        1,
        1000,
      ),
    },
    maxRolls: clampInt(settings.maxRolls, 1, 10),
    afterRollDelayMs: clampInt(
      settings.afterRollDelayMs ?? DEFAULT_SETTINGS.afterRollDelayMs,
      0,
      10_000,
    ),
    minBuyIn,
    maxBuyIn: clampInt(settings.maxBuyIn, minBuyIn, 10_000_000),
    straightPayout: {
      enabled:
        straight.enabled === undefined
          ? DEFAULT_SETTINGS.straightPayout.enabled
          : Boolean(straight.enabled),
      amountPerPlayer: clampInt(
        straight.amountPerPlayer ?? DEFAULT_SETTINGS.straightPayout.amountPerPlayer,
        0,
        100_000,
      ),
    },
    classicPot: {
      enabled:
        classic.enabled === undefined
          ? DEFAULT_SETTINGS.classicPot.enabled
          : Boolean(classic.enabled),
      donationAmount: clampInt(
        classic.donationAmount ?? DEFAULT_SETTINGS.classicPot.donationAmount,
        0,
        100_000,
      ),
    },
    yahtzeeBonus: {
      enabled:
        bonus.enabled === undefined
          ? DEFAULT_SETTINGS.yahtzeeBonus.enabled
          : Boolean(bonus.enabled),
      amountPerPlayer: clampInt(
        bonus.amountPerPlayer ?? DEFAULT_SETTINGS.yahtzeeBonus.amountPerPlayer,
        0,
        100_000,
      ),
    },
    firstRollYahtzeePayout: {
      enabled:
        firstRoll.enabled === undefined
          ? DEFAULT_SETTINGS.firstRollYahtzeePayout.enabled
          : Boolean(firstRoll.enabled),
      amountPerPlayer: clampInt(
        firstRoll.amountPerPlayer ?? DEFAULT_SETTINGS.firstRollYahtzeePayout.amountPerPlayer,
        0,
        100_000,
      ),
    },
  };
}
