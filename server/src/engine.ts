import type {
  Die,
  GameStatePublic,
  HandScore,
  PlayerId,
  RoomSettings,
  TurnState,
} from '@dice/shared';
import type { StraightKind, SubRoundState } from '@dice/shared';
import {
  canStandVoluntarily,
  compareHands,
  detectStraight,
  HAND_SIZE,
  resolveRound,
  scoreHand,
} from '@dice/shared';

/** Live view of a seated player. The engine mutates `chips` directly. */
export interface EnginePlayer {
  id: PlayerId;
  chips: number;
  seat: number | null;
  connected: boolean;
}

export type EngineEvent =
  | { type: 'roundStarted'; roundNumber: number; antes: { playerId: PlayerId; amount: number }[] }
  | { type: 'throwStarted'; playerId: PlayerId; kept: number[]; rollNumber: number }
  | { type: 'rolled'; playerId: PlayerId; dice: Die[]; rollNumber: number; kept: number[] }
  | { type: 'stood'; playerId: PlayerId; dice: Die[]; score: HandScore }
  /** Turn ended with no completed roll (timeout/disconnect/kick): no hand. */
  | { type: 'forfeited'; playerId: PlayerId }
  | {
      type: 'roundEnded';
      /** null when every turn was forfeited — no hands, the pot carries over. */
      winnerId: PlayerId | null;
      potWon: number;
      scores: { playerId: PlayerId; score: HandScore }[];
    }
  | {
      type: 'subRoundStarted';
      tiedPlayerIds: PlayerId[];
      anteAmount: number;
      depth: number;
      antes: { playerId: PlayerId; amount: number }[];
    }
  /** Instant straight side payment: each other seated player paid the roller. */
  | {
      type: 'straightPaid';
      playerId: PlayerId;
      kind: Exclude<StraightKind, 'none'>;
      amountPerPlayer: number;
      total: number;
      payments: { playerId: PlayerId; amount: number }[];
    }
  | { type: 'stateChanged' }
  | { type: 'gameEnded'; reason: string };

export type EngineError = {
  code: 'NOT_YOUR_TURN' | 'BAD_REQUEST' | 'STAND_NOT_ALLOWED';
  message: string;
};
const err = (code: EngineError['code'], message: string): EngineError => ({ code, message });

export interface EngineOptions {
  turnTimeoutMs?: number;
  roundEndDelayMs?: number;
  throwTimeoutMs?: number;
}

export const TURN_TIMEOUT_MS = 60_000;
export const ROUND_END_DELAY_MS = 5_000;
/**
 * Grace period for the roller's client to report a physics result after
 * turn:throwStart (ADR 004). Client-side settle timeout is 10s; past this the
 * throw is abandoned and the turn force-resolves (stand on previously settled
 * dice, or forfeit) so a dead client cannot stall the game.
 */
export const THROW_TIMEOUT_MS = 15_000;
/** Beyond this sub-round depth, antes stop and sudden-death single rolls decide it. */
export const MAX_SUBROUND_DEPTH = 10;

interface CurrentTurn {
  playerId: PlayerId;
  dice: Die[] | null;
  keptIndices: number[];
  rollsUsed: number;
  rollCap: number;
  deadline: number;
  /** The instant straight payout fired this turn (it pays at most once). */
  straightPaid: boolean;
}

/**
 * Socket-free round/turn state machine (rules: docs/GAME_RULES.md). The room layer
 * owns membership; the engine owns rounds, sub-rounds, turns, dice, pot,
 * chips, and straight payouts. Dice values come exclusively from the roller's
 * physics sim (ADR 004) — the engine never rolls.
 */
export class GameEngine {
  phase: 'playing' | 'roundEnd' | 'ended' = 'playing';
  roundNumber = 0;
  pot = 0;

  private participants: EnginePlayer[] = [];
  private queue: EnginePlayer[] = [];
  private currentTurn: CurrentTurn | null = null;
  private hands = new Map<PlayerId, { score: HandScore; dice: Die[] }>();
  private rollToBeat: { playerId: PlayerId; score: HandScore; dice: Die[] } | null = null;
  /** First finisher's rollsUsed caps everyone after them (roll-count pressure). */
  private roundRollCap: number | null = null;
  private lastWinnerId: PlayerId | null = null;
  private subRound: SubRoundState | null = null;

  /** In-flight physics throw (ADR 004): keeps locked at throwStart. */
  private pendingThrow: { playerId: PlayerId; keepIndices: number[] } | null = null;

  private readonly turnTimeoutMs: number;
  private readonly roundEndDelayMs: number;
  private readonly throwTimeoutMs: number;
  private turnTimer: NodeJS.Timeout | null = null;
  private roundTimer: NodeJS.Timeout | null = null;
  private throwTimer: NodeJS.Timeout | null = null;
  /** True for recovered engines until a player reconnects (PLAN.md 6.2). */
  private paused = false;

  constructor(
    private readonly getSeated: () => EnginePlayer[],
    private settings: RoomSettings,
    private readonly emit: (event: EngineEvent) => void,
    opts: EngineOptions = {},
  ) {
    this.turnTimeoutMs = opts.turnTimeoutMs ?? TURN_TIMEOUT_MS;
    this.roundEndDelayMs = opts.roundEndDelayMs ?? ROUND_END_DELAY_MS;
    this.throwTimeoutMs = opts.throwTimeoutMs ?? THROW_TIMEOUT_MS;
  }

  start(): void {
    this.startRound();
  }

  updateSettings(settings: RoomSettings): void {
    this.settings = settings;
  }

  get currentTurnPlayerId(): PlayerId | null {
    return this.currentTurn?.playerId ?? null;
  }

  // -- rounds ----------------------------------------------------------------

  private startRound(): void {
    const ante = this.settings.chipsPerRound;
    const seated = this.getSeated().filter((p) => p.seat !== null);

    // Broke players sit the round out but keep their seats.
    const able = seated.filter((p) => p.chips >= ante);
    if (able.length < 2) {
      this.end('not enough players can cover the ante');
      return;
    }

    for (const p of able) p.chips -= ante;
    this.pot += able.length * ante;
    this.participants = able;

    this.roundNumber += 1;
    this.phase = 'playing';
    this.subRound = null;
    this.hands.clear();
    this.rollToBeat = null;
    this.roundRollCap = null;
    this.queue = this.orderFromWinner(able);
    this.emit({
      type: 'roundStarted',
      roundNumber: this.roundNumber,
      antes: able.map((p) => ({ playerId: p.id, amount: ante })),
    });
    this.emit({ type: 'stateChanged' });
    this.nextTurn();
  }

  /**
   * Tie → sub-round among only the tied players, same pot, ante doubling each
   * level (chipsPerRound * 2^depth, all-in if short). Past MAX_SUBROUND_DEPTH:
   * sudden death — no ante, single roll each, repeat until broken.
   */
  private startSubRound(tiedIds: PlayerId[]): void {
    const depth = (this.subRound?.depth ?? 0) + 1;
    const suddenDeath = depth > MAX_SUBROUND_DEPTH;
    const tied = this.participants.filter((p) => tiedIds.includes(p.id));

    let anteAmount = 0;
    const antes: { playerId: PlayerId; amount: number }[] = [];
    if (!suddenDeath) {
      anteAmount = this.settings.chipsPerRound * 2 ** depth;
      for (const p of tied) {
        const paid = Math.min(anteAmount, p.chips); // all-in if short, no side pots
        p.chips -= paid;
        this.pot += paid;
        antes.push({ playerId: p.id, amount: paid });
      }
    }

    this.subRound = { depth, participantIds: tied.map((p) => p.id), anteAmount };
    this.phase = 'playing';
    this.hands.clear();
    this.rollToBeat = null;
    // maxRolls resets; sudden death forces a single roll each.
    this.roundRollCap = suddenDeath ? 1 : null;
    this.queue = [...tied].sort((a, b) => (a.seat ?? 0) - (b.seat ?? 0));

    this.emit({ type: 'subRoundStarted', tiedPlayerIds: tiedIds, anteAmount, depth, antes });
    this.emit({ type: 'stateChanged' });
    this.nextTurn();
  }

  /** Seat order starting left of the previous round's winner. */
  private orderFromWinner(players: EnginePlayer[]): EnginePlayer[] {
    const ordered = [...players].sort((a, b) => (a.seat ?? 0) - (b.seat ?? 0));
    const winnerIdx = ordered.findIndex((p) => p.id === this.lastWinnerId);
    if (winnerIdx < 0) return ordered;
    return [...ordered.slice(winnerIdx + 1), ...ordered.slice(0, winnerIdx + 1)];
  }

  private nextTurn(): void {
    this.clearTurnTimer();
    this.clearPendingThrow();
    const player = this.queue.shift();
    if (!player) {
      this.endRound();
      return;
    }

    this.currentTurn = {
      playerId: player.id,
      dice: null,
      keptIndices: [],
      rollsUsed: 0,
      rollCap: this.roundRollCap ?? this.settings.maxRolls,
      deadline: Date.now() + this.turnTimeoutMs,
      straightPaid: false,
    };
    this.emit({ type: 'stateChanged' });

    if (!player.connected) {
      this.forceStand(player.id);
      return;
    }

    this.turnTimer = setTimeout(() => this.forceStand(player.id), this.turnTimeoutMs);
    this.turnTimer.unref?.();
  }

  private endRound(): void {
    this.currentTurn = null;
    const scores = new Map([...this.hands].map(([id, h]) => [id, h.score]));

    // Every turn forfeited (no server roll exists to synthesize hands): no
    // winner, the pot carries over into the next round.
    if (scores.size === 0) {
      this.subRound = null;
      this.phase = 'roundEnd';
      this.emit({ type: 'roundEnded', winnerId: null, potWon: 0, scores: [] });
      this.emit({ type: 'stateChanged' });
      this.roundTimer = setTimeout(() => this.startRound(), this.roundEndDelayMs);
      this.roundTimer.unref?.();
      return;
    }

    const { winners } = resolveRound(scores);

    if (winners.length > 1) {
      this.startSubRound(winners);
      return;
    }

    const winnerId = winners[0]!;
    const winner = this.participantById(winnerId);
    const potWon = this.pot;
    if (winner) winner.chips += potWon;
    this.pot = 0;
    this.lastWinnerId = winnerId;
    this.subRound = null;
    this.phase = 'roundEnd';

    this.emit({
      type: 'roundEnded',
      winnerId,
      potWon,
      scores: [...scores].map(([playerId, score]) => ({ playerId, score })),
    });
    this.emit({ type: 'stateChanged' });

    this.roundTimer = setTimeout(() => this.startRound(), this.roundEndDelayMs);
    this.roundTimer.unref?.();
  }

  private participantById(id: PlayerId): EnginePlayer | undefined {
    return this.getSeated().find((p) => p.id === id) ?? this.participants.find((p) => p.id === id);
  }

  private end(reason: string): void {
    this.phase = 'ended';
    this.stop();
    this.emit({ type: 'gameEnded', reason });
  }

  // -- turns -------------------------------------------------------------------

  /**
   * Physics roll, phase 1 (ADR 004): the roller released the koozie. Locks
   * the keep set and waits for `commitThrow`. If the result never arrives,
   * `expireThrow` force-resolves the turn so the game cannot stall.
   */
  beginThrow(playerId: PlayerId, keepIndices: number[]): EngineError | null {
    const turn = this.guardTurn(playerId);
    if ('code' in turn) return turn;
    if (this.pendingThrow) return err('BAD_REQUEST', 'a throw is already in flight');

    if (turn.dice === null) {
      if (keepIndices.length > 0) return err('BAD_REQUEST', 'nothing to keep on the first roll');
    } else {
      const valid = this.validateKeep(turn, keepIndices);
      if (valid) return valid;
      if (keepIndices.length === HAND_SIZE) {
        return err('BAD_REQUEST', 'all dice kept — stand instead');
      }
    }

    this.pendingThrow = { playerId, keepIndices: [...keepIndices] };
    this.throwTimer = setTimeout(() => this.expireThrow(), this.throwTimeoutMs);
    this.throwTimer.unref?.();
    this.emit({
      type: 'throwStarted',
      playerId,
      kept: [...keepIndices],
      rollNumber: turn.rollsUsed + 1,
    });
    this.emit({ type: 'stateChanged' });
    return null;
  }

  /**
   * Physics roll, phase 2: the roller's sim settled on these faces. Kept
   * positions must be unchanged — that plus the range check is the entire
   * integrity check available under client-reported rolls.
   */
  commitThrow(playerId: PlayerId, dice: Die[]): EngineError | null {
    const turn = this.guardTurn(playerId);
    if ('code' in turn) return turn;
    const pending = this.pendingThrow;
    if (!pending || pending.playerId !== playerId) {
      return err('BAD_REQUEST', 'no throw in flight');
    }
    if (dice.length !== HAND_SIZE) return err('BAD_REQUEST', `expected ${HAND_SIZE} dice`);
    if (!dice.every((d) => Number.isInteger(d) && d >= 1 && d <= 6)) {
      return err('BAD_REQUEST', 'dice must be integers in [1, 6]');
    }
    if (turn.dice !== null) {
      for (const i of pending.keepIndices) {
        if (dice[i] !== turn.dice[i]) return err('BAD_REQUEST', 'kept dice cannot change value');
      }
    }

    this.clearPendingThrow();
    return this.settleRoll(turn, dice, pending.keepIndices);
  }

  /** Log replay (PLAN.md Phase 6): re-apply a recorded `rolled` event verbatim. */
  replayRolled(playerId: PlayerId, dice: Die[], kept: number[]): EngineError | null {
    const turn = this.guardTurn(playerId);
    if ('code' in turn) return turn;
    return this.settleRoll(turn, dice, kept);
  }

  /**
   * Apply settled faces to the turn — the single dice entry point for the live
   * physics path and log replay, so the straight payout and auto-stand fire
   * identically in both.
   */
  private settleRoll(turn: CurrentTurn, dice: Die[], kept: number[]): EngineError | null {
    turn.dice = [...dice];
    turn.rollsUsed += 1;
    turn.keptIndices = [...kept];
    this.emit({
      type: 'rolled',
      playerId: turn.playerId,
      dice: [...turn.dice],
      rollNumber: turn.rollsUsed,
      kept: [...turn.keptIndices],
    });
    this.applyStraightPayout(turn);

    if (turn.rollsUsed >= turn.rollCap) return this.stand(turn.playerId);
    this.emit({ type: 'stateChanged' });
    return null;
  }

  /** Throw result never arrived (crash/disconnect mid-throw): force-resolve the turn. */
  private expireThrow(): void {
    const pending = this.pendingThrow;
    if (!pending) return;
    this.clearPendingThrow();
    this.forceStand(pending.playerId);
  }

  private clearPendingThrow(): void {
    if (this.throwTimer) clearTimeout(this.throwTimer);
    this.throwTimer = null;
    this.pendingThrow = null;
  }

  /**
   * Player-requested stand: rejected while the current hand loses to the
   * roll-to-beat (shared `canStandVoluntarily` — ties are allowed). Forced
   * stands (roll cap, keep-all, timeout/disconnect/kick) call `stand` directly.
   */
  standVoluntarily(playerId: PlayerId): EngineError | null {
    const turn = this.guardTurn(playerId);
    if ('code' in turn) return turn;
    if (this.pendingThrow) return err('BAD_REQUEST', 'a throw is in flight');
    if (turn.dice === null) return err('BAD_REQUEST', 'roll before standing');
    if (!canStandVoluntarily(turn.dice, turn.rollsUsed, this.rollToBeat?.score ?? null)) {
      return err('STAND_NOT_ALLOWED', 'beat or tie the roll to beat, or keep rolling');
    }
    return this.stand(playerId);
  }

  stand(playerId: PlayerId): EngineError | null {
    const turn = this.guardTurn(playerId);
    if ('code' in turn) return turn;
    if (this.pendingThrow) return err('BAD_REQUEST', 'a throw is in flight');
    if (turn.dice === null) return err('BAD_REQUEST', 'roll before standing');

    const score = this.scoreFor(turn);
    this.hands.set(playerId, { score, dice: [...turn.dice] });
    this.emit({ type: 'stood', playerId, dice: [...turn.dice], score: { ...score } });

    if (this.rollToBeat === null || compareHands(score, this.rollToBeat.score) > 0) {
      this.rollToBeat = { playerId, score, dice: [...turn.dice] };
    }
    if (this.roundRollCap === null) this.roundRollCap = turn.rollsUsed;

    this.nextTurn();
    return null;
  }

  /**
   * Instant straight side payment (docs/GAME_RULES.md "Straights"): the moment a roll
   * settles showing a straight, every other seated player pays the roller from
   * their own pile, clamped to what they have — zero-sum, pot untouched, at
   * most once per turn. The turn then continues as normal.
   */
  private applyStraightPayout(turn: CurrentTurn): void {
    if (turn.straightPaid || !turn.dice) return;
    const kind = detectStraight(turn.dice);
    if (kind === 'none') return;
    turn.straightPaid = true;

    const config = this.settings.straightPayout;
    if (!config.enabled) return;
    const roller = this.participantById(turn.playerId);
    if (!roller) return;

    const perPlayer =
      kind === 'big' ? config.amountPerPlayer * config.bigMultiplier : config.amountPerPlayer;
    if (perPlayer <= 0) return;

    const payments: { playerId: PlayerId; amount: number }[] = [];
    let total = 0;
    for (const p of this.getSeated()) {
      if (p.id === turn.playerId || p.seat === null) continue;
      const paid = Math.min(perPlayer, p.chips); // chips never go negative
      p.chips -= paid;
      total += paid;
      payments.push({ playerId: p.id, amount: paid });
    }
    roller.chips += total;

    this.emit({
      type: 'straightPaid',
      playerId: turn.playerId,
      kind,
      amountPerPlayer: perPlayer,
      total,
      payments,
    });
  }

  /**
   * Auto-resolve a turn on timeout, disconnect, or kick. With settled dice the
   * player stands on them; with none there is no server roll to fall back on
   * (ADR 004 — dice come only from client physics), so the turn is forfeited:
   * no hand, no shot at the pot, and any ante stays in.
   */
  forceStand(playerId: PlayerId): void {
    const turn = this.currentTurn;
    if (!turn || turn.playerId !== playerId) return;
    // A pending physics result is abandoned; the forced outcome wins.
    this.clearPendingThrow();
    if (turn.dice === null) {
      this.emit({ type: 'forfeited', playerId });
      this.nextTurn();
      return;
    }
    this.stand(playerId);
  }

  private guardTurn(playerId: PlayerId): CurrentTurn | EngineError {
    if (this.phase !== 'playing') return err('BAD_REQUEST', 'no round in progress');
    if (!this.currentTurn || this.currentTurn.playerId !== playerId) {
      return err('NOT_YOUR_TURN', 'it is not your turn');
    }
    return this.currentTurn;
  }

  private validateKeep(turn: CurrentTurn, keepIndices: number[]): EngineError | null {
    const unique = new Set(keepIndices);
    if (unique.size !== keepIndices.length) return err('BAD_REQUEST', 'duplicate keep indices');
    for (const i of keepIndices) {
      if (!Number.isInteger(i) || i < 0 || i >= HAND_SIZE) {
        return err('BAD_REQUEST', `invalid keep index: ${i}`);
      }
    }
    // Kept dice are locked: the new keep set must include everything already kept.
    for (const i of turn.keptIndices) {
      if (!unique.has(i)) return err('BAD_REQUEST', 'kept dice cannot be released');
    }
    return null;
  }

  private scoreFor(turn: CurrentTurn): HandScore {
    if (!turn.dice) throw new Error('scoring a turn with no dice');
    return scoreHand(turn.dice, turn.rollsUsed);
  }

  // -- snapshot ------------------------------------------------------------------

  publicState(): GameStatePublic {
    const turn: TurnState | null = this.currentTurn
      ? {
          playerId: this.currentTurn.playerId,
          dice: this.currentTurn.dice ? [...this.currentTurn.dice] : [],
          keptIndices: [...this.currentTurn.keptIndices],
          rollsUsed: this.currentTurn.rollsUsed,
          rollCap: this.currentTurn.rollCap,
          deadline: this.currentTurn.deadline,
          throwing: this.pendingThrow !== null,
        }
      : null;

    return {
      roundNumber: this.roundNumber,
      pot: this.pot,
      turnQueue: this.queue.map((p) => p.id),
      currentTurn: turn,
      rollToBeat: this.rollToBeat
        ? {
            playerId: this.rollToBeat.playerId,
            score: { ...this.rollToBeat.score },
            dice: [...this.rollToBeat.dice],
          }
        : null,
      subRound: this.subRound ? { ...this.subRound, participantIds: [...this.subRound.participantIds] } : null,
    };
  }

  // -- persistence (PLAN.md Phase 6) -------------------------------------------------

  /** State that survives round-end compaction. Only meaningful in `roundEnd`. */
  persistedState(): { roundNumber: number; pot: number; lastWinnerId: PlayerId | null } {
    return {
      roundNumber: this.roundNumber,
      pot: this.pot,
      lastWinnerId: this.lastWinnerId,
    };
  }

  /** Restore from a compaction snapshot (always taken at a round boundary). */
  restore(state: { roundNumber: number; pot: number; lastWinnerId: PlayerId | null }): void {
    this.roundNumber = state.roundNumber;
    this.pot = state.pot;
    this.lastWinnerId = state.lastWinnerId;
    this.phase = 'roundEnd';
  }

  /** Cancel the round-end delay and begin the next round now (replay path). */
  advanceRound(): void {
    if (this.roundTimer) clearTimeout(this.roundTimer);
    this.roundTimer = null;
    this.startRound();
  }

  /** Freeze all timers after a replay; the room resumes on the first rejoin. */
  pause(): void {
    this.paused = true;
    this.clearTurnTimer();
    this.clearPendingThrow();
    if (this.roundTimer) clearTimeout(this.roundTimer);
    this.roundTimer = null;
  }

  /** Wake a recovered engine: fresh turn deadline, or schedule the next round. */
  resume(): void {
    if (!this.paused) return;
    this.paused = false;
    const turn = this.currentTurn;
    if (turn) {
      turn.deadline = Date.now() + this.turnTimeoutMs;
      this.turnTimer = setTimeout(() => this.forceStand(turn.playerId), this.turnTimeoutMs);
      this.turnTimer.unref?.();
      this.emit({ type: 'stateChanged' });
    } else if (this.phase === 'roundEnd') {
      this.roundTimer = setTimeout(() => this.startRound(), this.roundEndDelayMs);
      this.roundTimer.unref?.();
    }
  }

  // -- lifecycle --------------------------------------------------------------------

  private clearTurnTimer(): void {
    if (this.turnTimer) clearTimeout(this.turnTimer);
    this.turnTimer = null;
  }

  stop(): void {
    this.clearTurnTimer();
    this.clearPendingThrow();
    if (this.roundTimer) clearTimeout(this.roundTimer);
    this.roundTimer = null;
  }
}
