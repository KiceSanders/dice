/**
 * WebSocket message contracts. All messages are JSON: { type, ...payload }.
 * The server is authoritative over game state; dice values come exclusively
 * from the current roller's physics sim (turn:throwResult, ADR 004). There is
 * no server-side roll — a turn that never produces dice is forfeited.
 * Keep this file in sync with the tables in docs/PROTOCOL.md (same commit —
 * see docs/CODING_GUIDELINES.md §1).
 */

import type { SpecialMomentKind } from './specialMoments.js';
import type {
  ActiveRoomSummary,
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
  /** Request the public directory of rooms that currently have connected players. */
  | { type: 'room:list' }
  /** Room capacity is fixed at MAX_SEATED_PLAYERS and is not part of settings. */
  | { type: 'room:create'; playerName: string; settings: RoomSettings }
  | { type: 'room:join'; roomId: RoomId; playerName: string; rejoinToken?: string }
  | { type: 'seat:request'; buyIn: number }
  | { type: 'seat:approve'; playerId: PlayerId }
  | { type: 'seat:deny'; playerId: PlayerId }
  | { type: 'player:kick'; playerId: PlayerId }
  /** Room capacity is fixed and cannot be changed through settings. */
  | { type: 'settings:update'; settings: RoomSettings }
  | { type: 'game:start' }
  /** A seated player dismissed the round-results modal; begin the next round now. */
  | { type: 'round:continue' }
  /** Physics roll, phase 1: koozie released. Locks the keep set (ADR 004). */
  | { type: 'turn:throwStart'; keepIndices: number[] }
  /**
   * Physics roll, phase 2: the sim settled on these faces. `restPose` is where
   * the dice came to rest (canonical space, hand-index order, ADR 005) —
   * optional; the server drops it (never the throw) if validation fails.
   */
  | { type: 'turn:throwResult'; dice: Die[]; restPose?: BodyPose[] }
  /** Yahtzee bonus phase 1: koozie released with a temporary sixth die; quint stays railed. */
  | { type: 'turn:bonusThrowStart' }
  /** Yahtzee bonus throw, phase 2: the sim settled the bonus die on this face. */
  | { type: 'turn:bonusThrowResult'; die: Die }
  /** Live throw poses; relayed to everyone else in the room, never persisted. */
  | { type: 'dice:frames'; frames: PoseFrame[] }
  /** Voluntary stand; optional final selecting layout for the settled hand (ADR 005). */
  | { type: 'turn:stand'; restPose?: BodyPose[] }
  /** Publish or clear one device-local player recording for this room (ephemeral). */
  | { type: 'special-sound:update'; kind: SpecialMomentKind; wavBase64: string | null }
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
  | { type: 'rooms:list'; rooms: ActiveRoomSummary[] }
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
  /** The after-roll delay elapsed; outcome messages and turn consequences now follow. */
  | { type: 'turn:rollResolved'; playerId: PlayerId; dice: Die[]; rollNumber: number }
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
  /** Auto-raise advanced every effective stake at this round boundary. */
  | { type: 'stakes:raised'; roundNumber: number; incrementBy: number }
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
      /** Actual payments; equal floor may be below anteAmount for short stacks. */
      antes: { playerId: PlayerId; amount: number }[];
    }
  /** Instant straight side payment: each other seated player paid the roller. */
  | {
      type: 'straight:paid';
      playerId: PlayerId;
      kind: Exclude<StraightKind, 'none'>;
      amountPerPlayer: number;
      total: number;
      /** Actual per-payer transfers; min(amount, payer, roller) for short stacks. */
      payments: { playerId: PlayerId; amount: number }[];
    }
  /** First-roll four-of-a-kind donation into the Classic Pot. */
  | {
      type: 'classic:donated';
      playerId: PlayerId;
      amount: number;
      /** Classic pot total after the donation. */
      classicPot: number;
    }
  /** Classic (first-roll three 6s while roll-to-beat unset) wins the Classic Pot. */
  | {
      type: 'classic:won';
      playerId: PlayerId;
      /** Chips taken from the Classic Pot (pot is zeroed). */
      amount: number;
    }
  /** A Yahtzee settled: the roller owes a temporary sixth-die throw before auto-standing. */
  | { type: 'turn:bonusOffered'; playerId: PlayerId; face: Die }
  /** A bonus throw is in flight; the result arrives via turn:bonusRolled. */
  | { type: 'turn:bonusThrowStarted'; playerId: PlayerId }
  /** The bonus die settled. matched = die === face (a rolled 1 is NOT wild here). */
  | { type: 'turn:bonusRolled'; playerId: PlayerId; die: Die; face: Die; matched: boolean }
  /** Yahtzee bonus hit: every other seated player paid the roller. */
  | {
      type: 'yahtzee:paid';
      playerId: PlayerId;
      amountPerPlayer: number;
      total: number;
      /** Actual per-payer transfers; min(amount, payer, roller) for short stacks. */
      payments: { playerId: PlayerId; amount: number }[];
    }
  /** First-roll Yahtzee instant payment (wild-composed Yahtzees count). */
  | {
      type: 'yahtzee:first-roll-paid';
      playerId: PlayerId;
      amountPerPlayer: number;
      total: number;
      /** Actual per-payer transfers; min(amount, payer, roller) for short stacks. */
      payments: { playerId: PlayerId; amount: number }[];
    }
  /** One player's current custom recording changed; ephemeral and room-scoped. */
  | {
      type: 'special-sound:updated';
      playerId: PlayerId;
      kind: SpecialMomentKind;
      wavBase64: string | null;
    }
  /** An authoritative special moment occurred after its outcome barrier. */
  | { type: 'special-moment:hit'; playerId: PlayerId; kind: SpecialMomentKind }
  | {
      type: 'chat:message';
      playerId: PlayerId;
      playerName: string;
      /** Authoritative chip stack when the server accepted the message; null for legacy history. */
      chipsAtSend: number | null;
      text: string;
      ts: number;
    }
  | { type: 'error'; code: ErrorCode; message: string };
