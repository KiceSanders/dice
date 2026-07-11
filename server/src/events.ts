import type {
  BodyPose,
  Die,
  HandScore,
  PlayerId,
  RoomId,
  RoomPhase,
  RoomSettings,
  StraightKind,
} from '@dice/shared';

/**
 * Persistence event model (PLAN.md Phase 6). Every state-mutating change to a
 * room is recorded as one of these and appended to `server/logs/<roomId>.log`
 * as a JSON line. Replay applies the same events through the same reducers
 * the live path uses (`Room.applyEvent` + the engine, with logged dice values
 * re-applied verbatim through `engine.replayRolled`).
 */

/** A `PlayerRecord` minus the transient `connected` flag. */
export interface PersistedPlayer {
  id: PlayerId;
  name: string;
  rejoinToken: string;
  seat: number | null;
  chips: number;
  banned: boolean;
  joinedAt: number;
  seatedAt: number | null;
}

/** Engine state that survives compaction (only ever captured at round end). */
export interface PersistedGame {
  roundNumber: number;
  pot: number;
  /** Classic Pot side pool; optional so pre-classic logs still restore. */
  classicPot?: number;
  /** Seat that opened the last round/sub-round; next opener is CCW from this. */
  lastFirstRollerSeat: number | null;
}

export interface ChatHistoryEntry {
  playerId: PlayerId;
  playerName: string;
  text: string;
  ts: number;
}

export interface PersistedRoomState {
  roomId: RoomId;
  settings: RoomSettings;
  hostId: PlayerId;
  phase: RoomPhase;
  players: PersistedPlayer[];
  game: PersistedGame | null;
  /** Recent chat (ring buffer); optional so pre-Phase-10 logs still parse. */
  chat?: ChatHistoryEntry[];
}

export type RoomEvent =
  // -- log bootstrap ---------------------------------------------------------
  | { type: 'created'; roomId: RoomId; settings: RoomSettings }
  /** Compaction marker: full room state at a round boundary. */
  | { type: 'snapshot'; state: PersistedRoomState }
  // -- membership ------------------------------------------------------------
  | {
      type: 'playerJoined';
      player: { id: PlayerId; name: string; rejoinToken: string; joinedAt: number };
      host: boolean;
    }
  | { type: 'seated'; playerId: PlayerId; buyIn: number; seat: number; seatedAt: number }
  | { type: 'seatForfeited'; playerId: PlayerId }
  | { type: 'kicked'; playerId: PlayerId }
  | { type: 'settingsUpdated'; settings: RoomSettings }
  | { type: 'hostChanged'; hostId: PlayerId }
  // -- game (replayed through the engine) -------------------------------------
  | { type: 'gameStarted' }
  | {
      type: 'roundStarted';
      roundNumber: number;
      antes: { playerId: PlayerId; amount: number }[];
    }
  | {
      type: 'rolled';
      playerId: PlayerId;
      dice: Die[];
      kept: number[];
      rollNumber: number;
      /** Validated rest pose (ADR 005); optional so pre-ADR-005 logs still parse. */
      restPose?: BodyPose[];
    }
  | {
      type: 'stood';
      playerId: PlayerId;
      dice: Die[];
      score: HandScore;
      /** Final stand pose (ADR 005); optional so older logs still parse. */
      restPose?: BodyPose[];
    }
  /** Turn ended with no completed roll: replay must advance past the player. */
  | { type: 'forfeited'; playerId: PlayerId }
  | { type: 'gameEnded'; reason: string }
  // -- audit-only (outcomes are recomputed deterministically on replay) --------
  | {
      type: 'subRoundStarted';
      depth: number;
      participantIds: PlayerId[];
      anteAmount: number;
      antes: { playerId: PlayerId; amount: number }[];
    }
  | {
      type: 'straightPaid';
      playerId: PlayerId;
      kind: Exclude<StraightKind, 'none'>;
      amountPerPlayer: number;
      total: number;
      payments: { playerId: PlayerId; amount: number }[];
    }
  | {
      type: 'classicDonated';
      playerId: PlayerId;
      amount: number;
      classicPot: number;
    }
  | {
      type: 'classicWon';
      playerId: PlayerId;
      amount: number;
    }
  | { type: 'roundEnded'; winnerId: PlayerId | null; potWon: number }
  // -- chat (Phase 10) ---------------------------------------------------------
  | { type: 'chat'; playerId: PlayerId; playerName: string; text: string; ts: number };

/** Sink the room writes its events to (a `RoomLogStore` binding in prod). */
export interface RoomRecorder {
  append(event: RoomEvent): void;
  /** Rewrite the whole log as a single snapshot event (round-end compaction). */
  compact(state: PersistedRoomState): void;
}
