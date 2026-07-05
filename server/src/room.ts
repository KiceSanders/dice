import { randomUUID } from 'node:crypto';
import type {
  PlayerId,
  PlayerPublic,
  RoomId,
  RoomPhase,
  RoomSettings,
  RoomSnapshot,
  ServerMessage,
  StraightPayoutConfig,
} from '@dice/shared';
import { assertNever, DEFAULT_SETTINGS } from '@dice/shared';
import { type EngineEvent, type EngineOptions, GameEngine } from './engine.js';
import type { ChatHistoryEntry, PersistedRoomState, RoomEvent, RoomRecorder } from './events.js';

/** Anything that can receive server messages (Connection in prod, fakes in tests). */
export interface ClientLink {
  send(msg: ServerMessage): void;
}

export interface PlayerRecord {
  id: PlayerId;
  name: string;
  rejoinToken: string;
  seat: number | null;
  chips: number;
  banned: boolean;
  connected: boolean;
  joinedAt: number;
  /** Epoch ms when seated; used for host-transfer seniority. null = never seated. */
  seatedAt: number | null;
}

export const SEAT_FORFEIT_MS = 2 * 60 * 1000;

/** Chat limits (PLAN.md 10.1): ≤500 chars, 5 messages per 5 seconds per player. */
export const CHAT_MAX_LENGTH = 500;
export const CHAT_RATE_LIMIT = 5;
export const CHAT_RATE_WINDOW_MS = 5000;
export const CHAT_HISTORY_SIZE = 200;

const clampInt = (v: number, min: number, max: number) =>
  Math.min(max, Math.max(min, Math.round(v)));

/** Clamp incoming settings to the ranges documented in PLAN.md. */
export function clampSettings(s: RoomSettings): RoomSettings {
  const minBuyIn = clampInt(s.minBuyIn, 1, 1_000_000);
  // Lenient on straightPayout: settings replayed from logs written before the
  // instant-payout rules lack the key entirely and must fall back to defaults.
  const sp: Partial<StraightPayoutConfig> = s.straightPayout ?? {};
  const d = DEFAULT_SETTINGS.straightPayout;
  return {
    chipsPerRound: clampInt(s.chipsPerRound, 1, 1000),
    maxRolls: clampInt(s.maxRolls, 1, 10),
    maxPlayers: clampInt(s.maxPlayers, 2, 3),
    minBuyIn,
    maxBuyIn: clampInt(s.maxBuyIn, minBuyIn, 10_000_000),
    straightPayout: {
      enabled: sp.enabled === undefined ? d.enabled : Boolean(sp.enabled),
      amountPerPlayer: clampInt(sp.amountPerPlayer ?? d.amountPerPlayer, 0, 100_000),
      bigMultiplier: clampInt(sp.bigMultiplier ?? d.bigMultiplier, 1, 100),
    },
  };
}

// biome-ignore lint/suspicious/noControlCharactersInRegex: stripping control chars is the point
const NAME_CONTROL_CHARS = /[\u0000-\u001f\u007f]/g;

export function sanitizeName(name: string): string {
  return name.replace(NAME_CONTROL_CHARS, '').trim().slice(0, 24);
}

export type RoomError = {
  code: 'BAD_REQUEST' | 'ROOM_FULL' | 'NOT_HOST' | 'BANNED' | 'RATE_LIMITED';
  message: string;
};
const err = (code: RoomError['code'], message: string): RoomError => ({ code, message });

export class Room {
  readonly players = new Map<PlayerId, PlayerRecord>();
  readonly seatRequests = new Map<PlayerId, number>(); // playerId → buyIn
  hostId: PlayerId = '';
  phase: RoomPhase = 'lobby';
  settings: RoomSettings;
  /** Set when the last connection drops; cleared on any connect. For the reaper. */
  emptySince: number | null = Date.now();

  /** Recent chat (ring buffer of CHAT_HISTORY_SIZE); replayed to joiners. */
  readonly chatHistory: ChatHistoryEntry[] = [];

  engine: GameEngine | null = null;
  /** Event log sink; null while a room is being replayed (or persistence is off). */
  recorder: RoomRecorder | null = null;

  private readonly links = new Map<PlayerId, ClientLink>();
  private readonly forfeitTimers = new Map<PlayerId, NodeJS.Timeout>();
  /** Per-player send timestamps inside the rate-limit window. */
  private readonly chatStamps = new Map<PlayerId, number[]>();
  /** Called when a seated player must immediately stand (kick/disconnect mid-turn). */
  onForcedStand: ((playerId: PlayerId) => void) | null = null;

  constructor(
    readonly id: RoomId,
    settings: RoomSettings,
    private readonly seatForfeitMs = SEAT_FORFEIT_MS,
    public engineOpts: EngineOptions = {},
  ) {
    this.settings = clampSettings(settings);
  }

  // -- event reducer (shared by the live path and Phase 6 replay) -------------

  /**
   * Apply a state-mutating event. Live methods validate, then `commit` (apply +
   * record); replay calls this directly so both paths share the same reducer.
   */
  applyEvent(event: RoomEvent): void {
    switch (event.type) {
      case 'playerJoined': {
        this.players.set(event.player.id, {
          ...event.player,
          seat: null,
          chips: 0,
          banned: false,
          connected: true,
          seatedAt: null,
        });
        if (event.host) this.hostId = event.player.id;
        break;
      }
      case 'seated': {
        const player = this.players.get(event.playerId);
        if (!player) break;
        this.seatRequests.delete(event.playerId);
        player.seat = event.seat;
        player.chips = event.buyIn;
        player.seatedAt = event.seatedAt;
        break;
      }
      case 'seatForfeited': {
        const player = this.players.get(event.playerId);
        if (!player) break;
        player.seat = null;
        player.seatedAt = null;
        break;
      }
      case 'kicked': {
        const player = this.players.get(event.playerId);
        if (!player) break;
        player.seat = null;
        player.seatedAt = null;
        player.banned = true;
        this.seatRequests.delete(event.playerId);
        break;
      }
      case 'settingsUpdated':
        this.settings = clampSettings(event.settings);
        this.engine?.updateSettings(this.settings);
        break;
      case 'hostChanged':
        this.hostId = event.hostId;
        break;
      case 'gameStarted':
        this.attachEngine();
        break;
      case 'chat':
        this.chatHistory.push({
          playerId: event.playerId,
          playerName: event.playerName,
          text: event.text,
          ts: event.ts,
        });
        if (this.chatHistory.length > CHAT_HISTORY_SIZE) {
          this.chatHistory.splice(0, this.chatHistory.length - CHAT_HISTORY_SIZE);
        }
        break;
      case 'snapshot':
        this.restoreState(event.state);
        break;
      default:
        // Engine-driven and audit-only events are not applied here: replay
        // routes them through the engine (persistence.ts) or skips them.
        break;
    }
  }

  private commit(event: RoomEvent): void {
    this.applyEvent(event);
    this.recorder?.append(event);
  }

  // -- membership ----------------------------------------------------------

  /** Create a brand-new player (host or spectator). */
  addPlayer(name: string, link: ClientLink, opts: { host?: boolean } = {}): PlayerRecord {
    const id = randomUUID();
    this.commit({
      type: 'playerJoined',
      player: {
        id,
        name: sanitizeName(name) || 'Player',
        rejoinToken: randomUUID(),
        joinedAt: Date.now(),
      },
      host: opts.host === true || !this.hostId,
    });
    this.attach(id, link);
    return this.players.get(id)!;
  }

  /** Reclaim a previous identity by rejoin token. Returns null if no match. */
  rejoin(rejoinToken: string, link: ClientLink): PlayerRecord | null {
    for (const player of this.players.values()) {
      if (player.rejoinToken === rejoinToken) {
        player.connected = true;
        this.cancelForfeit(player.id);
        this.attach(player.id, link);
        return player;
      }
    }
    return null;
  }

  private attach(playerId: PlayerId, link: ClientLink): void {
    this.links.set(playerId, link);
    this.emptySince = null;
    const player = this.players.get(playerId);
    if (player) player.connected = true;
    // Wake a recovered (paused) game on the first reconnect.
    this.engine?.resume();
  }

  handleDisconnect(playerId: PlayerId): void {
    const player = this.players.get(playerId);
    this.links.delete(playerId);
    if (!player) return;
    player.connected = false;

    if (playerId === this.hostId) this.transferHost();

    if (player.seat !== null) {
      this.scheduleForfeit(playerId);
      if (this.isCurrentTurn(playerId)) this.onForcedStand?.(playerId);
    }

    if (this.connectedCount() === 0) this.emptySince = Date.now();
  }

  connectedCount(): number {
    return this.links.size;
  }

  // -- seats ---------------------------------------------------------------

  requestSeat(playerId: PlayerId, buyIn: number): RoomError | null {
    const player = this.players.get(playerId);
    if (!player) return err('BAD_REQUEST', 'unknown player');
    if (player.banned) return err('BANNED', 'you were kicked from this table');
    if (player.seat !== null) return err('BAD_REQUEST', 'already seated');
    if (this.seatedPlayers().length >= this.settings.maxPlayers) {
      return err('ROOM_FULL', 'all seats are taken');
    }
    if (buyIn < this.settings.minBuyIn || buyIn > this.settings.maxBuyIn) {
      return err(
        'BAD_REQUEST',
        `buy-in must be between ${this.settings.minBuyIn} and ${this.settings.maxBuyIn}`,
      );
    }

    if (playerId === this.hostId) {
      // Host's own request auto-approves.
      this.seatRequests.set(playerId, buyIn);
      return this.approveSeat(playerId);
    }

    this.seatRequests.set(playerId, buyIn);
    const hostLink = this.links.get(this.hostId);
    hostLink?.send({ type: 'seat:requested', playerId, playerName: player.name, buyIn });
    return null;
  }

  approveSeat(playerId: PlayerId): RoomError | null {
    const player = this.players.get(playerId);
    const buyIn = this.seatRequests.get(playerId);
    if (!player || buyIn === undefined) return err('BAD_REQUEST', 'no pending seat request');
    if (this.seatedPlayers().length >= this.settings.maxPlayers) {
      this.seatRequests.delete(playerId);
      return err('ROOM_FULL', 'all seats are taken');
    }

    this.commit({
      type: 'seated',
      playerId,
      buyIn,
      seat: this.firstFreeSeat(),
      seatedAt: Date.now(),
    });
    return null;
  }

  denySeat(playerId: PlayerId): RoomError | null {
    if (!this.seatRequests.delete(playerId)) return err('BAD_REQUEST', 'no pending seat request');
    this.links.get(playerId)?.send({ type: 'seat:denied' });
    return null;
  }

  /** Kick: seated → spectator, banned from future seat requests. */
  kick(playerId: PlayerId): RoomError | null {
    const player = this.players.get(playerId);
    if (!player) return err('BAD_REQUEST', 'unknown player');
    if (playerId === this.hostId) return err('BAD_REQUEST', 'host cannot kick themself');

    if (player.seat !== null && this.isCurrentTurn(playerId)) this.onForcedStand?.(playerId);
    this.cancelForfeit(playerId);
    this.commit({ type: 'kicked', playerId });
    return null;
  }

  seatedPlayers(): PlayerRecord[] {
    return [...this.players.values()]
      .filter((p) => p.seat !== null)
      .sort((a, b) => (a.seat ?? 0) - (b.seat ?? 0));
  }

  private firstFreeSeat(): number {
    const taken = new Set(this.seatedPlayers().map((p) => p.seat));
    for (let i = 0; i < this.settings.maxPlayers; i++) {
      if (!taken.has(i)) return i;
    }
    throw new Error('no free seat'); // guarded by callers
  }

  // -- host transfer & forfeit timers ---------------------------------------

  /** Promote the longest-seated connected player, else the longest-connected spectator. */
  private transferHost(): void {
    const candidates = [...this.players.values()].filter(
      (p) => p.connected && p.id !== this.hostId,
    );
    if (candidates.length === 0) return; // room is empty; reaper will handle it

    const seated = candidates
      .filter((p) => p.seatedAt !== null)
      .sort((a, b) => (a.seatedAt ?? 0) - (b.seatedAt ?? 0));
    const next = seated[0] ?? candidates.sort((a, b) => a.joinedAt - b.joinedAt)[0];
    if (next) this.commit({ type: 'hostChanged', hostId: next.id });
  }

  private scheduleForfeit(playerId: PlayerId): void {
    this.cancelForfeit(playerId);
    const timer = setTimeout(() => {
      this.forfeitTimers.delete(playerId);
      const player = this.players.get(playerId);
      if (player && !player.connected && player.seat !== null) {
        this.commit({ type: 'seatForfeited', playerId });
        this.broadcastState();
      }
    }, this.seatForfeitMs);
    timer.unref?.();
    this.forfeitTimers.set(playerId, timer);
  }

  private cancelForfeit(playerId: PlayerId): void {
    const timer = this.forfeitTimers.get(playerId);
    if (timer) clearTimeout(timer);
    this.forfeitTimers.delete(playerId);
  }

  private isCurrentTurn(playerId: PlayerId): boolean {
    return this.engine?.currentTurnPlayerId === playerId;
  }

  // -- game ------------------------------------------------------------------

  startGame(byPlayerId: PlayerId): RoomError | null {
    if (byPlayerId !== this.hostId) return err('NOT_HOST', 'only the host can start the game');
    if (this.engine) return err('BAD_REQUEST', 'game already in progress');
    if (this.seatedPlayers().length < 2)
      return err('BAD_REQUEST', 'need at least 2 seated players');

    this.commit({ type: 'gameStarted' });
    this.engine!.start();
    return null;
  }

  /** Create the engine without starting it (live start + replay both use this). */
  private attachEngine(): void {
    this.engine = new GameEngine(
      () => this.seatedPlayers(),
      this.settings,
      (event) => this.onEngineEvent(event),
      this.engineOpts,
    );
    this.onForcedStand = (playerId) => this.engine?.forceStand(playerId);
    this.phase = 'playing';
  }

  /** Tear the engine down (logged gameEnded live; reused by replay). */
  endGame(): void {
    this.engine?.stop();
    this.engine = null;
    this.onForcedStand = null;
    this.phase = 'lobby';
  }

  private onEngineEvent(event: EngineEvent): void {
    switch (event.type) {
      case 'roundStarted':
        this.recorder?.append({
          type: 'roundStarted',
          roundNumber: event.roundNumber,
          antes: event.antes,
        });
        break;
      case 'throwStarted':
        // Not recorded: replay only needs the final values (the 'rolled' event).
        this.broadcast({
          type: 'turn:throwStarted',
          playerId: event.playerId,
          kept: event.kept,
          rollNumber: event.rollNumber,
        });
        break;
      case 'rolled':
        this.recorder?.append({
          type: 'rolled',
          playerId: event.playerId,
          dice: event.dice,
          kept: event.kept,
          rollNumber: event.rollNumber,
        });
        this.broadcast({
          type: 'turn:rolled',
          playerId: event.playerId,
          dice: event.dice,
          rollNumber: event.rollNumber,
          kept: event.kept,
        });
        this.broadcastState();
        break;
      case 'stood':
        this.recorder?.append({
          type: 'stood',
          playerId: event.playerId,
          dice: event.dice,
          score: event.score,
        });
        break;
      case 'forfeited':
        // Recorded and replayed: a forfeited turn leaves no rolled/stood
        // events, so replay needs this to advance the queue past the player.
        this.recorder?.append({ type: 'forfeited', playerId: event.playerId });
        this.broadcast({ type: 'turn:forfeited', playerId: event.playerId });
        break;
      case 'subRoundStarted':
        this.recorder?.append({
          type: 'subRoundStarted',
          depth: event.depth,
          participantIds: event.tiedPlayerIds,
          anteAmount: event.anteAmount,
          antes: event.antes,
        });
        this.broadcast({
          type: 'subround:started',
          tiedPlayerIds: event.tiedPlayerIds,
          anteAmount: event.anteAmount,
          depth: event.depth,
        });
        break;
      case 'straightPaid':
        this.recorder?.append({
          type: 'straightPaid',
          playerId: event.playerId,
          kind: event.kind,
          amountPerPlayer: event.amountPerPlayer,
          total: event.total,
          payments: event.payments,
        });
        this.broadcast({
          type: 'straight:paid',
          playerId: event.playerId,
          kind: event.kind,
          amountPerPlayer: event.amountPerPlayer,
          total: event.total,
          payments: event.payments,
        });
        break;
      case 'roundEnded':
        this.phase = 'roundEnd';
        this.recorder?.append({
          type: 'roundEnded',
          winnerId: event.winnerId,
          potWon: event.potWon,
        });
        // Compact at the round boundary so the log never grows unbounded.
        this.recorder?.compact(this.buildPersistedState());
        this.broadcast({
          type: 'round:ended',
          winnerId: event.winnerId,
          potWon: event.potWon,
          scores: event.scores,
        });
        this.broadcastState();
        break;
      case 'stateChanged':
        if (this.engine?.phase === 'playing') this.phase = 'playing';
        this.broadcastState();
        break;
      case 'gameEnded':
        this.recorder?.append({ type: 'gameEnded', reason: event.reason });
        this.endGame();
        this.broadcastState();
        break;
      default:
        // Compile error here = a new EngineEvent is not persisted/broadcast above.
        assertNever(event, 'unhandled EngineEvent');
    }
  }

  // -- chat (Phase 10) ---------------------------------------------------------

  sendChat(playerId: PlayerId, text: string): RoomError | null {
    const player = this.players.get(playerId);
    if (!player) return err('BAD_REQUEST', 'unknown player');

    // biome-ignore lint/suspicious/noControlCharactersInRegex: stripping control chars is the point
    const clean = text.replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '').trim();
    if (!clean) return err('BAD_REQUEST', 'message is empty');
    if (clean.length > CHAT_MAX_LENGTH) {
      return err('BAD_REQUEST', `message exceeds ${CHAT_MAX_LENGTH} characters`);
    }

    const now = Date.now();
    const stamps = (this.chatStamps.get(playerId) ?? []).filter(
      (t) => now - t < CHAT_RATE_WINDOW_MS,
    );
    if (stamps.length >= CHAT_RATE_LIMIT) {
      this.chatStamps.set(playerId, stamps);
      return err(
        'RATE_LIMITED',
        `slow down — max ${CHAT_RATE_LIMIT} messages per ${CHAT_RATE_WINDOW_MS / 1000}s`,
      );
    }
    stamps.push(now);
    this.chatStamps.set(playerId, stamps);

    this.commit({ type: 'chat', playerId, playerName: player.name, text: clean, ts: now });
    this.broadcast({
      type: 'chat:message',
      playerId,
      playerName: player.name,
      text: clean,
      ts: now,
    });
    return null;
  }

  /** Replay buffered chat to one player (sent right after `room:joined`). */
  sendChatHistory(playerId: PlayerId): void {
    const link = this.links.get(playerId);
    if (!link) return;
    for (const entry of this.chatHistory) {
      link.send({ type: 'chat:message', ...entry });
    }
  }

  // -- settings --------------------------------------------------------------

  updateSettings(settings: RoomSettings): RoomError | null {
    if (this.phase === 'playing') {
      return err('BAD_REQUEST', 'settings can only change between rounds');
    }
    this.commit({ type: 'settingsUpdated', settings: clampSettings(settings) });
    return null;
  }

  // -- persistence -------------------------------------------------------------

  buildPersistedState(): PersistedRoomState {
    return {
      roomId: this.id,
      settings: this.settings,
      hostId: this.hostId,
      phase: this.phase,
      players: [...this.players.values()].map((p) => ({
        id: p.id,
        name: p.name,
        rejoinToken: p.rejoinToken,
        seat: p.seat,
        chips: p.chips,
        banned: p.banned,
        joinedAt: p.joinedAt,
        seatedAt: p.seatedAt,
      })),
      game: this.engine?.persistedState() ?? null,
      chat: [...this.chatHistory],
    };
  }

  private restoreState(state: PersistedRoomState): void {
    this.settings = clampSettings(state.settings);
    this.players.clear();
    for (const p of state.players) this.players.set(p.id, { ...p, connected: true });
    this.hostId = state.hostId;
    this.chatHistory.length = 0;
    if (state.chat) this.chatHistory.push(...state.chat);
    if (state.game) {
      this.attachEngine();
      this.engine!.restore(state.game);
    }
    this.phase = state.phase;
  }

  // -- snapshots --------------------------------------------------------------

  buildSnapshot(forPlayerId: PlayerId): RoomSnapshot {
    const players: PlayerPublic[] = [...this.players.values()].map((p) => ({
      id: p.id,
      name: p.name,
      connected: p.connected,
      isHost: p.id === this.hostId,
      seat: p.seat,
      chips: p.chips,
      banned: p.banned,
    }));

    // Pending requests are host-visible; everyone else sees only their own.
    const seatRequests = [...this.seatRequests.entries()]
      .filter(([pid]) => forPlayerId === this.hostId || pid === forPlayerId)
      .map(([playerId, buyIn]) => ({ playerId, buyIn }));

    return {
      roomId: this.id,
      settings: this.settings,
      phase: this.phase,
      players,
      hostId: this.hostId,
      game: this.engine?.publicState() ?? null,
      seatRequests,
    };
  }

  /** Send every connected player their own snapshot. */
  broadcastState(): void {
    for (const [playerId, link] of this.links) {
      link.send({ type: 'room:state', snapshot: this.buildSnapshot(playerId) });
    }
  }

  /** Send the same message to every connected player. */
  broadcast(msg: ServerMessage): void {
    for (const link of this.links.values()) link.send(msg);
  }

  /** Send the same message to everyone but one player (dice:frames relay). */
  broadcastExcept(excludeId: PlayerId, msg: ServerMessage): void {
    for (const [playerId, link] of this.links) {
      if (playerId !== excludeId) link.send(msg);
    }
  }

  sendTo(playerId: PlayerId, msg: ServerMessage): void {
    this.links.get(playerId)?.send(msg);
  }

  destroy(): void {
    this.engine?.stop();
    this.engine = null;
    for (const timer of this.forfeitTimers.values()) clearTimeout(timer);
    this.forfeitTimers.clear();
    this.links.clear();
  }
}
