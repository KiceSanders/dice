/**
 * WebSocket message contracts. All messages are JSON: { type, ...payload }.
 * The server is authoritative over game state; dice values come from the
 * current roller's physics sim (turn:throwResult, ADR 004) with a server-side
 * RNG fallback, or from server RNG on the legacy turn:roll path.
 * Keep this file in sync with the protocol tables in PLAN.md.
 */

import type {
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
  | { type: 'turn:roll'; keepIndices: number[] }
  /** Physics roll, phase 1: koozie released. Locks the keep set (ADR 004). */
  | { type: 'turn:throwStart'; keepIndices: number[] }
  /** Physics roll, phase 2: the sim settled on these faces. */
  | { type: 'turn:throwResult'; dice: Die[] }
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
  | { type: 'turn:rolled'; playerId: PlayerId; dice: Die[]; rollNumber: number; kept: number[] }
  /** A physics throw is in flight; final values arrive via turn:rolled. */
  | { type: 'turn:throwStarted'; playerId: PlayerId; kept: number[]; rollNumber: number }
  /** Relay of the current roller's throw poses (ADR 004). */
  | { type: 'dice:frames'; playerId: PlayerId; frames: PoseFrame[] }
  | {
      type: 'round:ended';
      winnerId: PlayerId;
      potWon: number;
      scores: { playerId: PlayerId; score: HandScore }[];
    }
  | { type: 'subround:started'; tiedPlayerIds: PlayerId[]; anteAmount: number; depth: number }
  | {
      type: 'bonus:awarded';
      playerId: PlayerId;
      amount: number;
      kind: Exclude<StraightKind, 'none'>;
      target: 'pot' | 'direct';
      streak: number;
    }
  | { type: 'chat:message'; playerId: PlayerId; playerName: string; text: string; ts: number }
  | { type: 'error'; code: ErrorCode; message: string };
