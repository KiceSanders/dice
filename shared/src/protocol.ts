/**
 * WebSocket message contracts. All messages are JSON: { type, ...payload }.
 * The server is authoritative; the client never computes game outcomes.
 * Keep this file in sync with the protocol tables in PLAN.md.
 */

import type {
  Die,
  HandScore,
  PlayerId,
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
