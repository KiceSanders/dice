import {
  type BetALotSettings,
  DEFAULT_BETALOT_SETTINGS,
  DEFAULT_BLACKJACK_SETTINGS,
  DEFAULT_SETTINGS,
  type GameKind,
  type GameSettings,
  type RoomSettings,
} from '../types.js';

export interface GameDefinition {
  kind: GameKind;
  label: string;
  blurb: string;
  minSeats: number;
  maxSeats: number;
  defaultSettings: GameSettings;
}

export const GAME_DEFINITIONS: Record<GameKind, GameDefinition> = {
  blackjack: {
    kind: 'blackjack',
    label: 'Dice Blackjack',
    blurb: 'Roll toward 21. Stand or continue. Twelve-sided overtime doubles the stakes.',
    minSeats: 2,
    maxSeats: 2,
    defaultSettings: DEFAULT_BLACKJACK_SETTINGS,
  },
  dice5: {
    kind: 'dice5',
    label: 'Dice',
    blurb: 'Build the best five-die hand and beat the table.',
    minSeats: 2,
    maxSeats: 8,
    defaultSettings: DEFAULT_SETTINGS,
  },
  betalot: {
    kind: 'betalot',
    label: 'Bet-a-lot',
    blurb: 'A heads-up escalating dice ladder with side bets.',
    minSeats: 2,
    maxSeats: 2,
    defaultSettings: DEFAULT_BETALOT_SETTINGS,
  },
};

export function gameKindOf(settings: GameSettings): GameKind {
  return settings.kind ?? 'dice5';
}

export function isBetALotSettings(settings: GameSettings): settings is BetALotSettings {
  return settings.kind === 'betalot';
}

export function isDice5Settings(settings: GameSettings): settings is RoomSettings {
  return settings.kind === undefined || settings.kind === 'dice5';
}
