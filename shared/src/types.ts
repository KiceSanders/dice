/**
 * Domain types shared by client and server.
 * The canonical rules these types encode live in docs/GAME_RULES.md.
 */

export type PlayerId = string;
export type RoomId = string;
/** The ruleset selected before a room is created. */
export type GameKind = 'dice5' | 'betalot';

/** Fixed room capacity. Player count is not configurable per room. */
export const MAX_SEATED_PLAYERS = 8;

/** A single die face. */
export type Die = 1 | 2 | 3 | 4 | 5 | 6;

/** One rigid-body pose on the wire: [x, y, z, qx, qy, qz, qw]. */
export type BodyPose = [number, number, number, number, number, number, number];

/**
 * One sampled moment of a live physics throw, streamed by the roller and
 * relayed verbatim to spectators (ADR 004). Ephemeral — never persisted.
 */
export interface PoseFrame {
  /** Ms since the roller started streaming this throw. */
  t: number;
  /** Koozie pose first, then one pose per die in hand-index order. */
  bodies: BodyPose[];
  /** False once the cup is set down out of view (settling/selecting). */
  cupVisible?: boolean;
}

export type StraightKind = 'none' | 'straight';

/**
 * Instant side payment when a roll settles showing a straight (once per turn):
 * every other seated player immediately pays the roller from their own pile,
 * each transfer min(amount, payer stack). Separate from the round-winner pot.
 */
export interface StraightPayoutConfig {
  enabled: boolean;
  /** Chips each other seated player pays the roller. */
  amountPerPlayer: number;
}

/**
 * Side pool funded by first-roll four-of-a-kind donations; paid out on a
 * "classic" (three 6s) in a normal round while roll-to-beat is still unset. Separate from the
 * round-winner ante pot. See docs/GAME_RULES.md "Classic Pot".
 */
export interface ClassicPotConfig {
  enabled: boolean;
  /** Chips the roller donates to the classic pot on a first-roll four-of-a-kind. */
  donationAmount: number;
}

/**
 * Yahtzee bonus: when a roll settles as five of a kind (wilds count), the
 * roller throws a temporary sixth die while the five-die quint stays on the
 * rail. If it literally matches the quint's scored face (a rolled 1 is NOT
 * wild here), every other seated player pays the roller min(amount, payer
 * stack). The roller then stands automatically. Zero-sum.
 * See docs/GAME_RULES.md "Yahtzee bonus".
 */
export interface YahtzeeBonusConfig {
  enabled: boolean;
  /** Chips each other seated player pays the roller on a match. */
  amountPerPlayer: number;
}

/**
 * Instant side payment for scoring a Yahtzee on the first roll of a turn.
 * Wild-composed Yahtzees count. Separate from the Yahtzee bonus throw.
 */
export interface FirstRollYahtzeePayoutConfig {
  enabled: boolean;
  /** Chips each other seated player pays the roller. */
  amountPerPlayer: number;
}

/** Auto-raise adds one multiplier-sized step to every stake each period. */
export interface AutoIncrementConfig {
  enabled: boolean;
  /** Rounds between additive stake increases. */
  everyRounds: number;
}

/** Settings shared by every room game. */
export interface BaseRoomSettings {
  /** Quiet window after dice settle before any outcome or turn consequence is revealed. */
  afterRollDelayMs: number;
  minBuyIn: number;
  maxBuyIn: number;
}

export interface RoomSettings extends BaseRoomSettings {
  /** Omitted by legacy dice5 clients; normalized as dice5 by the room registry. */
  kind?: 'dice5';
  chipsPerRound: number;
  /**
   * Scales every starting stake and is the amount added at each auto-raise.
   * See docs/GAME_RULES.md "Stakes: multiplier and auto-raise".
   */
  betMultiplier: number;
  /** Periodic additive raise of effective stake amounts. */
  autoIncrement: AutoIncrementConfig;
  /** Absolute max rolls for the round's first player. */
  maxRolls: number;
  straightPayout: StraightPayoutConfig;
  classicPot: ClassicPotConfig;
  yahtzeeBonus: YahtzeeBonusConfig;
  firstRollYahtzeePayout: FirstRollYahtzeePayoutConfig;
}

export const DEFAULT_SETTINGS: RoomSettings = {
  chipsPerRound: 1,
  betMultiplier: 1,
  autoIncrement: {
    enabled: true,
    everyRounds: 7,
  },
  maxRolls: 5,
  afterRollDelayMs: 2_000,
  minBuyIn: 10,
  maxBuyIn: 1000,
  straightPayout: {
    enabled: true,
    amountPerPlayer: 3,
  },
  classicPot: {
    enabled: true,
    donationAmount: 1,
  },
  yahtzeeBonus: {
    enabled: true,
    amountPerPlayer: 3,
  },
  firstRollYahtzeePayout: {
    enabled: true,
    amountPerPlayer: 4,
  },
};

/**
 * Settings for the heads-up Bet-a-lot ruleset. Every monetary amount is a
 * room-host setting, making the rules explicit and replayable.
 */
export interface BetALotSettings extends BaseRoomSettings {
  kind: 'betalot';
  callPayout: number;
  openingOnePenalty: number;
  lossPayouts: {
    twoDice: number;
    threeDice: number;
    fourDice: number;
    fiveDice: number;
    sixDice: number;
  };
  /** Opener payment when the opponent successfully clears rung six. */
  successfulRungSixPayout: number;
  straightPayouts: {
    threeDice: number;
    fourDice: number;
    fiveDice: number;
    sixDice: number;
  };
  allSamePayouts: {
    twoDice: number;
    threeDice: number;
    fourDice: number;
    fiveDice: number;
    sixDice: number;
  };
  allSameExtraPayouts: {
    threeDice: number;
    fourDice: number;
    fiveDice: number;
    sixDice: number;
  };
  fullHousePayout: number;
  sevenOpponentPayout: number;
  sevenPotContribution: number;
  overTwentyFivePerPoint: number;
}

export const DEFAULT_BETALOT_SETTINGS: BetALotSettings = {
  kind: 'betalot',
  afterRollDelayMs: 2_000,
  minBuyIn: 10,
  maxBuyIn: 1_000,
  callPayout: 3,
  openingOnePenalty: 1,
  lossPayouts: { twoDice: 5, threeDice: 4, fourDice: 3, fiveDice: 2, sixDice: 1 },
  successfulRungSixPayout: 1,
  straightPayouts: { threeDice: 2, fourDice: 5, fiveDice: 10, sixDice: 20 },
  allSamePayouts: { twoDice: 1, threeDice: 3, fourDice: 4, fiveDice: 5, sixDice: 6 },
  allSameExtraPayouts: { threeDice: 5, fourDice: 20, fiveDice: 50, sixDice: 100 },
  fullHousePayout: 10,
  sevenOpponentPayout: 1,
  sevenPotContribution: 1,
  overTwentyFivePerPoint: 2,
};

/**
 * Legacy dice5 settings intentionally omit a kind on the wire for backwards
 * compatibility with persisted rooms. New rooms normalize it to `dice5`.
 */
export type GameSettings = RoomSettings | BetALotSettings;

/**
 * Final score of a stood hand. Comparison order: count > face > fewer rollsUsed.
 * Face is skipped when both hands are Yahtzees (count === 5).
 * `straight` is metadata for the instant payout only — ignored by compareHands.
 */
export interface HandScore {
  /** Size of the largest group of identical dice. */
  count: number;
  /** Face value of that group (higher face wins count ties except Yahtzees). */
  face: Die;
  rollsUsed: number;
  /** Set when the dice form a straight; does not affect ranking. */
  straight: StraightKind;
}

export interface PlayerPublic {
  id: PlayerId;
  name: string;
  connected: boolean;
  isHost: boolean;
  /** null = spectator; otherwise seat index 0–7. */
  seat: number | null;
  chips: number;
  /** Banned from requesting a seat (was kicked). */
  banned: boolean;
}

export type RoomPhase = 'lobby' | 'playing' | 'roundEnd';

/** Public lobby-directory entry for a room with at least one connected player. */
export interface ActiveRoomSummary {
  roomId: RoomId;
  phase: RoomPhase;
  /** Null until the host starts the first game. */
  roundNumber: number | null;
  /** Connected players only, in join order. */
  playerNames: string[];
}

export interface TurnState {
  playerId: PlayerId;
  dice: Die[];
  /** Indices into `dice` that are locked. */
  keptIndices: number[];
  rollsUsed: number;
  /** Max rolls allowed this turn (set by round leader's roll count). */
  rollCap: number;
  /** True while a physics throw is in flight (throwStart → throwResult, ADR 004). */
  throwing: boolean;
  /** True after dice settle while the configured after-roll delay is running. */
  resolving: boolean;
  /** True when the delayed result will change koozie ownership or enter a special throw. */
  koozieLocked: boolean;
  /** Set while the turn awaits its Yahtzee bonus die (docs/GAME_RULES.md "Yahtzee bonus"). */
  bonusPending: { face: Die } | null;
  /**
   * Where the last roll's dice physically came to rest (ADR 005): canonical
   * table space, one pose per die in hand-index order, cup excluded. Null
   * until the first roll or when the roller's pose failed validation.
   */
  restPose: BodyPose[] | null;
}

export interface SubRoundState {
  depth: number;
  participantIds: PlayerId[];
  anteAmount: number;
}

export interface GameStatePublic {
  roundNumber: number;
  pot: number;
  /** Side pool for Classic Pot (docs/GAME_RULES.md); separate from `pot`. */
  classicPot: number;
  /** Seat-ordered player ids still to act this (sub-)round. */
  turnQueue: PlayerId[];
  currentTurn: TurnState | null;
  rollToBeat: {
    /** Leaders who set or tied this hand (first stander first, later tiers appended). */
    playerIds: PlayerId[];
    score: HandScore;
    dice: Die[];
    /** Rest pose of the leading hand (see TurnState.restPose). */
    restPose: BodyPose[] | null;
  } | null;
  subRound: SubRoundState | null;
}

/** A score produced by one Bet-a-lot ladder rung. */
export interface BetALotLadderRoll {
  rung: number;
  playerId: PlayerId;
  dice: Die[];
  score: number;
  restPose: BodyPose[] | null;
}

export interface BetALotFireState {
  playerId: PlayerId;
  streak: number;
  onFire: boolean;
}

export interface BetALotRoundResult {
  roundNumber: number;
  winnerId: PlayerId;
}

export interface BetALotStatePublic {
  kind: 'betalot';
  roundNumber: number;
  sevensPot: number;
  openerId: PlayerId;
  currentPlayerId: PlayerId | null;
  currentDiceCount: number;
  /** A call is accepted only before the opening one-die throw. */
  awaitingCall: boolean;
  pendingCall: Die | null;
  throwing: boolean;
  resolving: boolean;
  extraRoll: {
    playerId: PlayerId;
    face: Die;
    sourceDiceCount: number;
  } | null;
  ladder: BetALotLadderRoll[];
  /** Newest-first authoritative winners, capped at the last ten rounds. */
  roundHistory: BetALotRoundResult[];
  fire: BetALotFireState[];
}

export type AnyGameStatePublic = GameStatePublic | BetALotStatePublic;

export function isBetALotState(
  game: AnyGameStatePublic | null | undefined,
): game is BetALotStatePublic {
  return game !== null && game !== undefined && 'kind' in game && game.kind === 'betalot';
}

export function isDice5State(game: AnyGameStatePublic | null | undefined): game is GameStatePublic {
  return game !== null && game !== undefined && !isBetALotState(game);
}

/** Authoritative room snapshot pushed to clients after every state change. */
export interface RoomSnapshot {
  roomId: RoomId;
  settings: GameSettings;
  phase: RoomPhase;
  players: PlayerPublic[];
  hostId: PlayerId;
  game: AnyGameStatePublic | null;
  /** Pending seat requests, visible to the host (and the requester themself). */
  seatRequests: { playerId: PlayerId; buyIn: number }[];
}
