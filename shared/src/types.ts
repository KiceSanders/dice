/**
 * Domain types shared by client and server.
 * The canonical rules these types encode live in docs/GAME_RULES.md.
 */

export type PlayerId = string;
export type RoomId = string;

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
 * clamped to what they have. Separate from the round-winner pot.
 */
export interface StraightPayoutConfig {
  enabled: boolean;
  /** Chips each other seated player pays the roller. */
  amountPerPlayer: number;
}

export interface RoomSettings {
  chipsPerRound: number;
  /** Absolute max rolls for the round's first player. */
  maxRolls: number;
  /** 2–3 seats. */
  maxPlayers: number;
  minBuyIn: number;
  maxBuyIn: number;
  straightPayout: StraightPayoutConfig;
}

export const DEFAULT_SETTINGS: RoomSettings = {
  chipsPerRound: 1,
  maxRolls: 5,
  maxPlayers: 3,
  minBuyIn: 10,
  maxBuyIn: 1000,
  straightPayout: {
    enabled: true,
    amountPerPlayer: 5,
  },
};

/** Final score of a stood hand. Comparison order: straight > count > face > fewer rollsUsed. */
export interface HandScore {
  /** Size of the largest group of identical dice. */
  count: number;
  /** Face value of that group (higher face wins count ties within a hand). */
  face: Die;
  rollsUsed: number;
  straight: StraightKind;
}

export interface PlayerPublic {
  id: PlayerId;
  name: string;
  connected: boolean;
  isHost: boolean;
  /** null = spectator; otherwise seat index 0–2 (TABLE_SEAT_COUNT seats). */
  seat: number | null;
  chips: number;
  /** Banned from requesting a seat (was kicked). */
  banned: boolean;
}

export type RoomPhase = 'lobby' | 'playing' | 'roundEnd';

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
  /** Seat-ordered player ids still to act this (sub-)round. */
  turnQueue: PlayerId[];
  currentTurn: TurnState | null;
  rollToBeat: {
    playerId: PlayerId;
    score: HandScore;
    dice: Die[];
    /** Rest pose of the leading hand (see TurnState.restPose). */
    restPose: BodyPose[] | null;
  } | null;
  subRound: SubRoundState | null;
}

/** Authoritative room snapshot pushed to clients after every state change. */
export interface RoomSnapshot {
  roomId: RoomId;
  settings: RoomSettings;
  phase: RoomPhase;
  players: PlayerPublic[];
  hostId: PlayerId;
  game: GameStatePublic | null;
  /** Pending seat requests, visible to the host (and the requester themself). */
  seatRequests: { playerId: PlayerId; buyIn: number }[];
}
