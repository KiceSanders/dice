/**
 * WebSocket message contracts. All messages are JSON: { type, ...payload }.
 * The server is authoritative over game state; dice values come exclusively
 * from the current roller's physics sim (turn:throwResult, ADR 004). There is
 * no server-side roll — a turn that never produces dice is forfeited.
 * Keep this file in sync with the tables in docs/PROTOCOL.md (same commit —
 * see docs/CODING_GUIDELINES.md §1).
 */

import type {
  BodyPose,
  Die,
  HandScore,
  PlayerId,
  PoseFrame,
  RoomId,
  RoomSettings,
  RoomSnapshot,
  StraightKind,
} from './types.js';

// ---------------------------------------------------------------------------
// Client → Server
// ---------------------------------------------------------------------------

export type ClientMessage =
  | { type: 'room:create'; playerName: string; settings: RoomSettings }
  | { type: 'room:join'; roomId: RoomId; playerName: string; rejoinToken?: string }
  | { type: 'seat:request'; buyIn: number }
  | { type: 'seat:approve'; playerId: PlayerId }
  | { type: 'seat:deny'; playerId: PlayerId }
  | { type: 'player:kick'; playerId: PlayerId }
  | { type: 'settings:update'; settings: RoomSettings }
  | { type: 'game:start' }
  /** Physics roll, phase 1: koozie released. Locks the keep set (ADR 004). */
  | { type: 'turn:throwStart'; keepIndices: number[] }
  /**
   * Physics roll, phase 2: the sim settled on these faces. `restPose` is where
   * the dice came to rest (canonical space, hand-index order, ADR 005) —
   * optional; the server drops it (never the throw) if validation fails.
   */
  | { type: 'turn:throwResult'; dice: Die[]; restPose?: BodyPose[] }
  /** Live throw poses; relayed to everyone else in the room, never persisted. */
  | { type: 'dice:frames'; frames: PoseFrame[] }
  | { type: 'turn:stand' }
  | { type: 'chat:send'; text: string };

// ---------------------------------------------------------------------------
// Server → Client
// ---------------------------------------------------------------------------

export type ErrorCode =
  | 'BAD_REQUEST'
  | 'ROOM_NOT_FOUND'
  | 'ROOM_FULL'
  | 'NOT_HOST'
  | 'NOT_YOUR_TURN'
  | 'STAND_NOT_ALLOWED'
  | 'NOT_SEATED'
  | 'BANNED'
  | 'RATE_LIMITED'
  | 'INTERNAL';

export type ServerMessage =
  | { type: 'room:created'; roomId: RoomId; playerId: PlayerId; rejoinToken: string }
  | { type: 'room:joined'; playerId: PlayerId; rejoinToken: string; snapshot: RoomSnapshot }
  | { type: 'room:state'; snapshot: RoomSnapshot }
  | { type: 'seat:requested'; playerId: PlayerId; playerName: string; buyIn: number }
  | { type: 'seat:denied' }
  | {
      type: 'turn:rolled';
      playerId: PlayerId;
      dice: Die[];
      rollNumber: number;
      kept: number[];
      /** Validated rest pose (canonical space) or null when unavailable (ADR 005). */
      restPose: BodyPose[] | null;
    }
  /** A physics throw is in flight; final values arrive via turn:rolled. */
  | { type: 'turn:throwStarted'; playerId: PlayerId; kept: number[]; rollNumber: number }
  /** Relay of the current roller's throw poses (ADR 004). */
  | { type: 'dice:frames'; playerId: PlayerId; frames: PoseFrame[] }
  /** A turn ended with no completed roll (disconnect/kick): no hand. */
  | { type: 'turn:forfeited'; playerId: PlayerId }
  /** Exact chips collected from each participant when a normal round begins. */
  | {
      type: 'round:started';
      roundNumber: number;
      antes: { playerId: PlayerId; amount: number }[];
    }
  | {
      type: 'round:ended';
      /** null when every turn was forfeited — no hands, the pot carries over. */
      winnerId: PlayerId | null;
      potWon: number;
      scores: { playerId: PlayerId; score: HandScore }[];
    }
  | {
      type: 'subround:started';
      tiedPlayerIds: PlayerId[];
      anteAmount: number;
      depth: number;
      /** Actual payments; may be below anteAmount for all-in players. */
      antes: { playerId: PlayerId; amount: number }[];
    }
  /** Instant straight side payment: each other seated player paid the roller. */
  | {
      type: 'straight:paid';
      playerId: PlayerId;
      kind: Exclude<StraightKind, 'none'>;
      amountPerPlayer: number;
      total: number;
      /** Actual per-payer transfers; may be below amountPerPlayer for short stacks. */
      payments: { playerId: PlayerId; amount: number }[];
    }
  | { type: 'chat:message'; playerId: PlayerId; playerName: string; text: string; ts: number }
  | { type: 'error'; code: ErrorCode; message: string };
