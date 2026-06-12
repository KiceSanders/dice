import { randomInt } from 'node:crypto';
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
  calcStraightBonus,
  compareHands,
  HAND_SIZE,
  keepAndReroll,
  resolveRound,
  rollDice,
  scoreHand,
  type Rng,
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
  | { type: 'rolled'; playerId: PlayerId; dice: Die[]; rollNumber: number; kept: number[] }
  | { type: 'stood'; playerId: PlayerId; dice: Die[]; score: HandScore }
  | {
      type: 'roundEnded';
      winnerId: PlayerId;
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
  | {
      type: 'bonusAwarded';
      playerId: PlayerId;
      amount: number;
      kind: Exclude<StraightKind, 'none'>;
      target: 'pot' | 'direct';
      streak: number;
    }
  | { type: 'stateChanged' }
  | { type: 'gameEnded'; reason: string };

export type EngineError = {
  code: 'NOT_YOUR_TURN' | 'BAD_REQUEST';
  message: string;
};
const err = (code: EngineError['code'], message: string): EngineError => ({ code, message });

export interface EngineOptions {
  rng?: Rng;
  turnTimeoutMs?: number;
  roundEndDelayMs?: number;
}

export const TURN_TIMEOUT_MS = 60_000;
export const ROUND_END_DELAY_MS = 5_000;
/** Beyond this sub-round depth, antes stop and sudden-death single rolls decide it. */
export const MAX_SUBROUND_DEPTH = 10;

/** Default rng: crypto-backed uniform [0, 1). randomInt's max bound is 2^48 - 1. */
const RNG_MAX = 2 ** 48 - 1;
export const cryptoRng: Rng = () => randomInt(RNG_MAX) / RNG_MAX;

/**
 * Deterministic rng for the DEBUG_SEED env hook (PLAN.md Phase 9 verification):
 * mulberry32 over an FNV-1a hash of the seed string. Same seed → same dice.
 */
export function seededRng(seed: string): Rng {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  let s = h >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface CurrentTurn {
  playerId: PlayerId;
  dice: Die[] | null;
  keptIndices: number[];
  rollsUsed: number;
  rollCap: number;
  deadline: number;
}

/**
 * Socket-free round/turn state machine (PLAN.md Phases 4–5). The room layer
 * owns membership; the engine owns rounds, sub-rounds, turns, dice, pot,
 * chips, and straight bonuses.
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
  /** Consecutive turns (any player) ending in a straight; resets on a non-straight. */
  private straightStreak = 0;

  private readonly rng: Rng;
  private readonly turnTimeoutMs: number;
  private readonly roundEndDelayMs: number;
  private turnTimer: NodeJS.Timeout | null = null;
  private roundTimer: NodeJS.Timeout | null = null;
  /** True for recovered engines until a player reconnects (PLAN.md 6.2). */
  private paused = false;

  constructor(
    private readonly getSeated: () => EnginePlayer[],
    private settings: RoomSettings,
    private readonly emit: (event: EngineEvent) => void,
    opts: EngineOptions = {},
  ) {
    this.rng = opts.rng ?? cryptoRng;
    this.turnTimeoutMs = opts.turnTimeoutMs ?? TURN_TIMEOUT_MS;
    this.roundEndDelayMs = opts.roundEndDelayMs ?? ROUND_END_DELAY_MS;
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

  roll(playerId: PlayerId, keepIndices: number[]): EngineError | null {
    const turn = this.guardTurn(playerId);
    if ('code' in turn) return turn;

    if (turn.dice === null) {
      // First roll: nothing to keep yet.
      if (keepIndices.length > 0) return err('BAD_REQUEST', 'nothing to keep on the first roll');
      turn.dice = rollDice(HAND_SIZE, this.rng);
    } else {
      const valid = this.validateKeep(turn, keepIndices);
      if (valid) return valid;
      if (keepIndices.length === HAND_SIZE) {
        // Keeping everything is a stand.
        turn.keptIndices = keepIndices;
        return this.stand(playerId);
      }
      turn.dice = keepAndReroll(turn.dice, keepIndices, this.rng);
    }

    turn.rollsUsed += 1;
    turn.keptIndices = [...keepIndices];
    this.emit({
      type: 'rolled',
      playerId,
      dice: [...turn.dice],
      rollNumber: turn.rollsUsed,
      kept: [...turn.keptIndices],
    });

    if (turn.rollsUsed >= turn.rollCap) return this.stand(playerId);
    this.emit({ type: 'stateChanged' });
    return null;
  }

  stand(playerId: PlayerId): EngineError | null {
    const turn = this.guardTurn(playerId);
    if ('code' in turn) return turn;
    if (turn.dice === null) return err('BAD_REQUEST', 'roll before standing');

    const score = this.scoreFor(turn);
    this.hands.set(playerId, { score, dice: [...turn.dice] });
    this.emit({ type: 'stood', playerId, dice: [...turn.dice], score: { ...score } });
    this.applyStraightBonus(playerId, score.straight);

    if (this.rollToBeat === null || compareHands(score, this.rollToBeat.score) > 0) {
      this.rollToBeat = { playerId, score, dice: [...turn.dice] };
    }
    if (this.roundRollCap === null) this.roundRollCap = turn.rollsUsed;

    this.nextTurn();
    return null;
  }

  /** Streak update + bonus payout on every stood hand (PLAN.md "Straights"). */
  private applyStraightBonus(playerId: PlayerId, kind: StraightKind): void {
    if (kind === 'none') {
      this.straightStreak = 0;
      return;
    }
    this.straightStreak += 1;

    const config = this.settings.straightBonus;
    const amount = calcStraightBonus(config, kind, this.straightStreak);
    if (amount <= 0) return;

    if (config.type === 'pot') {
      this.pot += amount;
    } else {
      // 'direct' mints chips straight to the player.
      const player = this.participantById(playerId);
      if (player) player.chips += amount;
    }

    this.emit({
      type: 'bonusAwarded',
      playerId,
      amount,
      kind,
      target: config.type,
      streak: this.straightStreak,
    });
  }

  /** Auto-stand for timeouts, disconnects, and kicks. Rolls once if needed. */
  forceStand(playerId: PlayerId): void {
    const turn = this.currentTurn;
    if (!turn || turn.playerId !== playerId) return;
    if (turn.dice === null) {
      turn.dice = rollDice(HAND_SIZE, this.rng);
      turn.rollsUsed = 1;
      this.emit({ type: 'rolled', playerId, dice: [...turn.dice], rollNumber: 1, kept: [] });
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
      straightStreak: this.straightStreak,
    };
  }

  // -- persistence (PLAN.md Phase 6) -------------------------------------------------

  /** State that survives round-end compaction. Only meaningful in `roundEnd`. */
  persistedState(): { roundNumber: number; pot: number; lastWinnerId: PlayerId | null; straightStreak: number } {
    return {
      roundNumber: this.roundNumber,
      pot: this.pot,
      lastWinnerId: this.lastWinnerId,
      straightStreak: this.straightStreak,
    };
  }

  /** Restore from a compaction snapshot (always taken at a round boundary). */
  restore(state: { roundNumber: number; pot: number; lastWinnerId: PlayerId | null; straightStreak: number }): void {
    this.roundNumber = state.roundNumber;
    this.pot = state.pot;
    this.lastWinnerId = state.lastWinnerId;
    this.straightStreak = state.straightStreak;
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
    if (this.roundTimer) clearTimeout(this.roundTimer);
    this.roundTimer = null;
  }
}
