import type {
  ActiveRoomSummary,
  BodyPose,
  Die,
  ErrorCode,
  HandScore,
  PlayerId,
  RoomSnapshot,
  ServerMessage,
} from '@dice/shared';
import { assertUnreachable, effectiveStakeAmount } from '@dice/shared';
import type { ConnectionStatus } from '../ws/client';

export const CHAT_BUFFER_SIZE = 200;
export const ACTIVITY_LOG_BUFFER_SIZE = 200;
const MAX_TOASTS = 5;

export interface ChatEntry {
  playerId: PlayerId;
  playerName: string;
  chipsAtSend: number | null;
  text: string;
  ts: number;
}

export interface ActivityLogEntry {
  text: string;
  ts: number;
}

export interface Toast {
  id: number;
  kind: 'error' | 'info';
  text: string;
}

export interface LastRoll {
  playerId: PlayerId;
  dice: Die[];
  rollNumber: number;
  kept: number[];
  /** Server-validated rest pose (canonical space, ADR 005) or null. */
  restPose: BodyPose[] | null;
  /** Client receive time, so the animation re-triggers on every roll. */
  receivedAt: number;
}

/** Delayed marker that unlocks outcome-only table effects for a settled roll. */
export interface RollResolutionInfo {
  playerId: PlayerId;
  dice: Die[];
  rollNumber: number;
  receivedAt: number;
}

/** Last `round:ended` payload, kept for the recap modal until dismissed. */
export interface RoundEndInfo {
  /** null when every turn was forfeited — no hands, the pot carries over. */
  winnerId: PlayerId | null;
  potWon: number;
  scores: { playerId: PlayerId; score: HandScore }[];
  receivedAt: number;
}

/** Last live ante announcement; snapshots alone do not preserve who paid what. */
export interface AnteInfo {
  kind: 'round' | 'subround';
  roundNumber?: number;
  depth?: number;
  contributions: { playerId: PlayerId; amount: number }[];
  /** Pot as of the pre-ante snapshot — captured at message time, because the
      post-ante room:state may render in the same React flush as this message. */
  potBefore: number;
  receivedAt: number;
}

/**
 * Last instant player-to-player transfer (straight payout today; any future
 * instant side bet sets this too). The seat-to-seat chip flight feeds off it —
 * a new instant-transfer message only needs a reducer case that fills this in.
 */
export interface TransferInfo {
  toPlayerId: PlayerId;
  /** Actual per-payer amounts (already floored server-side for short stacks). */
  payments: { playerId: PlayerId; amount: number }[];
  receivedAt: number;
}

/** Last Classic Pot donation; drives seat → classic-pot chip flight. */
export interface ClassicDonateInfo {
  playerId: PlayerId;
  amount: number;
  /** Classic pot before this donation (captured at message time). */
  classicPotBefore: number;
  receivedAt: number;
}

/** Last Classic Pot win; drives classic-pot → seat chip flight. */
export interface ClassicWinInfo {
  playerId: PlayerId;
  amount: number;
  receivedAt: number;
}

export interface AppState {
  connection: ConnectionStatus;
  /** Null until the first room-directory response arrives. */
  activeRooms: ActiveRoomSummary[] | null;
  me: { playerId: PlayerId; rejoinToken: string } | null;
  roomId: string | null;
  snapshot: RoomSnapshot | null;
  chat: ChatEntry[];
  activityLog: ActivityLogEntry[];
  lastRoll: LastRoll | null;
  lastRollResolution: RollResolutionInfo | null;
  lastAnte: AnteInfo | null;
  lastTransfer: TransferInfo | null;
  lastClassicDonate: ClassicDonateInfo | null;
  lastClassicWin: ClassicWinInfo | null;
  roundEnd: RoundEndInfo | null;
  toasts: Toast[];
  /** Set when joining failed terminally (e.g. unknown room). */
  joinError: { code: ErrorCode; message: string } | null;
}

export const initialState: AppState = {
  connection: 'closed',
  activeRooms: null,
  me: null,
  roomId: null,
  snapshot: null,
  chat: [],
  activityLog: [],
  lastRoll: null,
  lastRollResolution: null,
  lastAnte: null,
  lastTransfer: null,
  lastClassicDonate: null,
  lastClassicWin: null,
  roundEnd: null,
  toasts: [],
  joinError: null,
};

export type AppAction =
  | { type: 'server-message'; message: ServerMessage }
  | { type: 'connection-status'; status: ConnectionStatus }
  | { type: 'join-error'; code: ErrorCode; message: string }
  | { type: 'dismiss-toast'; id: number }
  | { type: 'dismiss-round-end' }
  | { type: 'leave-room' };

let nextToastId = 1;

function pushToast(toasts: Toast[], kind: Toast['kind'], text: string): Toast[] {
  return [...toasts, { id: nextToastId++, kind, text }].slice(-MAX_TOASTS);
}

function pushChat(chat: ChatEntry[], entries: ChatEntry[]): ChatEntry[] {
  if (entries.length === 0) return chat;
  return [...chat, ...entries].slice(-CHAT_BUFFER_SIZE);
}

function pushActivityLog(
  activityLog: ActivityLogEntry[],
  entries: ActivityLogEntry[],
): ActivityLogEntry[] {
  if (entries.length === 0) return activityLog;
  return [...activityLog, ...entries].slice(-ACTIVITY_LOG_BUFFER_SIZE);
}

function activityLine(text: string): ActivityLogEntry {
  return { text, ts: Date.now() };
}

function playerName(state: AppState, id: PlayerId): string {
  return state.snapshot?.players.find((p) => p.id === id)?.name ?? 'Someone';
}

export function reducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'connection-status':
      return { ...state, connection: action.status };

    case 'join-error':
      return { ...state, joinError: { code: action.code, message: action.message } };

    case 'dismiss-toast':
      return { ...state, toasts: state.toasts.filter((t) => t.id !== action.id) };

    case 'dismiss-round-end':
      return { ...state, roundEnd: null };

    case 'leave-room':
      return {
        ...initialState,
        connection: state.connection,
      };

    case 'server-message':
      return applyServerMessage(state, action.message);

    default: {
      // Compile error here = a new AppAction is missing a case above.
      assertUnreachable(action);
      return state;
    }
  }
}

function applyServerMessage(state: AppState, msg: ServerMessage): AppState {
  switch (msg.type) {
    case 'rooms:list':
      return { ...state, activeRooms: msg.rooms };

    case 'room:created':
      return {
        ...state,
        roomId: msg.roomId,
        me: { playerId: msg.playerId, rejoinToken: msg.rejoinToken },
        joinError: null,
      };

    case 'room:joined':
      return {
        ...state,
        roomId: msg.snapshot.roomId,
        me: { playerId: msg.playerId, rejoinToken: msg.rejoinToken },
        snapshot: msg.snapshot,
        lastRoll: null,
        lastRollResolution: null,
        lastAnte: null,
        lastTransfer: null,
        lastClassicDonate: null,
        lastClassicWin: null,
        joinError: null,
      };

    case 'room:state': {
      let toasts = state.toasts;
      const activityLines: ActivityLogEntry[] = [];
      const prev = state.snapshot;
      const next = msg.snapshot;
      if (prev && state.me) {
        const myId = state.me.playerId;
        const meBefore = prev.players.find((p) => p.id === myId);
        const meAfter = next.players.find((p) => p.id === myId);
        // Kicked: I was seated, now I'm an (unseated) banned spectator.
        if (meBefore?.seat != null && meAfter && meAfter.seat === null && meAfter.banned) {
          toasts = pushToast(toasts, 'error', 'You were kicked from your seat');
        }
        if (prev.hostId !== next.hostId) {
          const hostName = next.players.find((p) => p.id === next.hostId)?.name ?? 'someone';
          toasts = pushToast(
            toasts,
            'info',
            next.hostId === myId ? 'You are now the host' : `${hostName} is now the host`,
          );
        }
        // Activity lines: joins and kicks (diffed against the last snapshot).
        const prevById = new Map(prev.players.map((p) => [p.id, p]));
        for (const p of next.players) {
          const before = prevById.get(p.id);
          if (!before) {
            activityLines.push(activityLine(`${p.name} joined`));
          } else if (!before.banned && p.banned) {
            activityLines.push(activityLine(`${p.name} was kicked`));
          }
        }
      }
      return {
        ...state,
        snapshot: next,
        toasts,
        activityLog: pushActivityLog(state.activityLog, activityLines),
      };
    }

    // Physics-roll messages (ADR 004): the 3D table consumes these directly
    // off the ws client; app state only changes via the snapshot and the
    // turn:rolled that follow. dice:frames especially must never churn the
    // reducer — it arrives at stream rate.
    case 'turn:throwStarted':
    case 'turn:bonusThrowStarted':
    case 'dice:frames':
    case 'special-sound:updated':
    case 'special-moment:hit':
      return state;

    case 'turn:rolled':
      return {
        ...state,
        lastRoll: {
          playerId: msg.playerId,
          dice: msg.dice,
          rollNumber: msg.rollNumber,
          kept: msg.kept,
          restPose: msg.restPose,
          receivedAt: Date.now(),
        },
      };

    case 'turn:rollResolved':
      return {
        ...state,
        lastRollResolution: {
          playerId: msg.playerId,
          dice: msg.dice,
          rollNumber: msg.rollNumber,
          receivedAt: Date.now(),
        },
      };

    case 'chat:message': {
      // The server replays history on rejoin; skip messages we already have.
      const duplicate = state.chat.some(
        (e) => e.ts === msg.ts && e.playerId === msg.playerId && e.text === msg.text,
      );
      if (duplicate) return state;
      return {
        ...state,
        chat: pushChat(state.chat, [
          {
            playerId: msg.playerId,
            playerName: msg.playerName,
            chipsAtSend: msg.chipsAtSend,
            text: msg.text,
            ts: msg.ts,
          },
        ]),
      };
    }

    case 'seat:requested':
      return {
        ...state,
        toasts: pushToast(
          state.toasts,
          'info',
          `${msg.playerName} requests a seat (${msg.buyIn} chips)`,
        ),
      };

    case 'seat:denied':
      return { ...state, toasts: pushToast(state.toasts, 'info', 'Your seat request was denied') };

    case 'round:started':
      return {
        ...state,
        lastRoll: null,
        lastRollResolution: null,
        roundEnd: null,
        lastAnte: {
          kind: 'round',
          roundNumber: msg.roundNumber,
          contributions: msg.antes,
          potBefore: state.snapshot?.game?.pot ?? 0,
          receivedAt: Date.now(),
        },
      };

    case 'stakes:raised': {
      const text = `Auto-raise: all bets increased by ${msg.incrementBy} chip${msg.incrementBy === 1 ? '' : 's'} for round ${msg.roundNumber}`;
      return {
        ...state,
        toasts: pushToast(state.toasts, 'info', text),
        activityLog: pushActivityLog(state.activityLog, [activityLine(text)]),
      };
    }

    case 'subround:started':
      return {
        ...state,
        lastRoll: null,
        lastRollResolution: null,
        lastAnte: {
          kind: 'subround',
          depth: msg.depth,
          contributions: msg.antes,
          potBefore: state.snapshot?.game?.pot ?? 0,
          receivedAt: Date.now(),
        },
        activityLog: pushActivityLog(state.activityLog, [
          activityLine(`Tie! Sub-round (depth ${msg.depth}) — ante ${msg.anteAmount}`),
        ]),
      };

    case 'error':
      if (msg.code === 'ROOM_NOT_FOUND') {
        return { ...state, joinError: { code: msg.code, message: msg.message } };
      }
      return { ...state, toasts: pushToast(state.toasts, 'error', msg.message) };

    case 'round:ended': {
      const line =
        msg.winnerId === null
          ? 'Round over — no hands stood; the pot carries over'
          : `${playerName(state, msg.winnerId)} wins the round (${msg.potWon} chip${msg.potWon === 1 ? '' : 's'})`;
      return {
        ...state,
        roundEnd: {
          winnerId: msg.winnerId,
          potWon: msg.potWon,
          scores: msg.scores,
          receivedAt: Date.now(),
        },
        activityLog: pushActivityLog(state.activityLog, [activityLine(line)]),
      };
    }

    case 'turn:forfeited':
      return {
        ...state,
        activityLog: pushActivityLog(state.activityLog, [
          activityLine(
            `${playerName(state, msg.playerId)}'s turn was forfeited — no roll completed`,
          ),
        ]),
      };

    case 'straight:paid': {
      // Chip totals arrive via the next room:state snapshot; lastTransfer
      // drives the seat-to-seat chip flight, the rest is announce-only.
      const text = `${playerName(state, msg.playerId)} rolled a straight — collects ${msg.total} chips (${msg.amountPerPlayer} each)`;
      return {
        ...state,
        lastTransfer: {
          toPlayerId: msg.playerId,
          payments: msg.payments,
          receivedAt: Date.now(),
        },
        activityLog: pushActivityLog(state.activityLog, [activityLine(text)]),
      };
    }

    case 'classic:donated': {
      const text = `${playerName(state, msg.playerId)} rolled four of a kind — donates ${msg.amount} to the Classic Pot`;
      return {
        ...state,
        lastClassicDonate: {
          playerId: msg.playerId,
          amount: msg.amount,
          classicPotBefore: msg.classicPot - msg.amount,
          receivedAt: Date.now(),
        },
        activityLog: pushActivityLog(state.activityLog, [activityLine(text)]),
      };
    }

    case 'classic:won': {
      const text = `${playerName(state, msg.playerId)} rolled a classic — wins the Classic Pot (${msg.amount} chip${msg.amount === 1 ? '' : 's'})`;
      return {
        ...state,
        lastClassicWin: {
          playerId: msg.playerId,
          amount: msg.amount,
          receivedAt: Date.now(),
        },
        activityLog: pushActivityLog(state.activityLog, [activityLine(text)]),
      };
    }

    case 'turn:bonusOffered': {
      const snapshot = state.snapshot;
      const amount =
        snapshot?.game?.roundNumber === undefined
          ? undefined
          : effectiveStakeAmount(
              snapshot.settings.yahtzeeBonus.amountPerPlayer,
              snapshot.settings,
              snapshot.game.roundNumber,
            );
      const text = `${playerName(state, msg.playerId)} rolled a Yahtzee — bonus throw: match a ${msg.face}${amount ? ` to collect ${amount} per player` : ''}`;
      return {
        ...state,
        toasts: pushToast(state.toasts, 'info', text),
        activityLog: pushActivityLog(state.activityLog, [activityLine(text)]),
      };
    }

    case 'turn:bonusRolled': {
      // A match is announced by the yahtzee:paid that follows. Never touches
      // lastRoll — that drives the 5-dice static view of the settled hand.
      if (msg.matched) return state;
      const text = `${playerName(state, msg.playerId)}'s bonus die shows ${msg.die} — no match (needed ${msg.face})`;
      return {
        ...state,
        activityLog: pushActivityLog(state.activityLog, [activityLine(text)]),
      };
    }

    case 'yahtzee:paid': {
      const text = `${playerName(state, msg.playerId)} matched the Yahtzee bonus — collects ${msg.total} chips (${msg.amountPerPlayer} each)`;
      return {
        ...state,
        lastTransfer: {
          toPlayerId: msg.playerId,
          payments: msg.payments,
          receivedAt: Date.now(),
        },
        activityLog: pushActivityLog(state.activityLog, [activityLine(text)]),
      };
    }

    case 'yahtzee:first-roll-paid': {
      const text = `${playerName(state, msg.playerId)} rolled a first-roll Yahtzee — collects ${msg.total} chips (${msg.amountPerPlayer} each)`;
      return {
        ...state,
        lastTransfer: {
          toPlayerId: msg.playerId,
          payments: msg.payments,
          receivedAt: Date.now(),
        },
        activityLog: pushActivityLog(state.activityLog, [activityLine(text)]),
      };
    }

    default: {
      // Compile error here = a new ServerMessage is missing a case above.
      // At runtime an unknown message (newer server) is ignored, never a crash.
      assertUnreachable(msg);
      return state;
    }
  }
}
