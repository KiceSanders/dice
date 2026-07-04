/**
 * Domain types shared by client and server.
 * The canonical rules these types encode live in PLAN.md ("Canonical Game Rules").
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

export type StraightKind = 'none' | 'little' | 'big';

export interface StraightBonusConfig {
  enabled: boolean;
  /** 'pot' adds the bonus to the central pot; 'direct' pays the player immediately. */
  type: 'pot' | 'direct';
  baseAmount: number;
  /** Big straight pays baseAmount * multiplier; little straight pays baseAmount. */
  multiplier: number;
  /** If true, consecutive straights scale the payout by streak length (before the cap). */
  incremental: boolean;
  /** Hard cap on any single bonus payout. */
  maxBonus: number;
}

export interface RoomSettings {
  chipsPerRound: number;
  /** Absolute max rolls for the round's first player. */
  maxRolls: number;
  /** 2–3 seats. */
  maxPlayers: number;
  minBuyIn: number;
  maxBuyIn: number;
  straightBonus: StraightBonusConfig;
}

export const DEFAULT_SETTINGS: RoomSettings = {
  chipsPerRound: 1,
  maxRolls: 3,
  maxPlayers: 3,
  minBuyIn: 10,
  maxBuyIn: 1000,
  straightBonus: {
    enabled: true,
    type: 'pot',
    baseAmount: 5,
    multiplier: 2,
    incremental: false,
    maxBonus: 50,
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
  /** null = spectator; otherwise seat index 0–7. */
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
  /** Epoch ms when the turn auto-stands. */
  deadline: number;
  /** True while a physics throw is in flight (throwStart → throwResult, ADR 004). */
  throwing: boolean;
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
  rollToBeat: { playerId: PlayerId; score: HandScore; dice: Die[] } | null;
  subRound: SubRoundState | null;
  /** Consecutive-straight streak length (for incremental bonuses). */
  straightStreak: number;
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
