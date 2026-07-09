import type {
  BodyPose,
  Die,
  GameStatePublic,
  HandScore,
  PlayerId,
  RoomSettings,
  StraightKind,
  SubRoundState,
  TurnState,
} from '@dice/shared';
import {
  canStandVoluntarily,
  compareHands,
  detectStraight,
  HAND_SIZE,
  orderPlayersFromFirstRollerSeat,
  resolveRound,
  scoreHand,
  validateRestPose,
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
  | {
      type: 'rolled';
      playerId: PlayerId;
      dice: Die[];
      rollNumber: number;
      kept: number[];
      /** Validated rest pose (canonical space, ADR 005) or null when unavailable. */
      restPose: BodyPose[] | null;
    }
  | { type: 'stood'; playerId: PlayerId; dice: Die[]; score: HandScore }
  /** Turn ended with no completed roll (disconnect/kick): no hand. */
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
  roundEndDelayMs?: number;
}

export const ROUND_END_DELAY_MS = 5_000;
/** Beyond this sub-round depth, antes stop and sudden-death single rolls decide it. */
export const MAX_SUBROUND_DEPTH = 10;

interface CurrentTurn {
  playerId: PlayerId;
  dice: Die[] | null;
  keptIndices: number[];
  rollsUsed: number;
  rollCap: number;
  /** The instant straight payout fired this turn (it pays at most once). */
  straightPaid: boolean;
  /** Validated rest pose of the latest roll (canonical space, ADR 005). */
  restPose: BodyPose[] | null;
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
  private rollToBeat: {
    playerId: PlayerId;
    score: HandScore;
    dice: Die[];
    restPose: BodyPose[] | null;
  } | null = null;
  /** First finisher's rollsUsed caps everyone after them (roll-count pressure). */
  private roundRollCap: number | null = null;
  /** Seat that opened the previous round/sub-round (null = first round of a game). */
  private lastFirstRollerSeat: number | null = null;
  private subRound: SubRoundState | null = null;

  /** In-flight physics throw (ADR 004): keeps locked at throwStart. */
  private pendingThrow: { playerId: PlayerId; keepIndices: number[] } | null = null;

  private readonly roundEndDelayMs: number;
  private roundTimer: NodeJS.Timeout | null = null;
  /** True for recovered engines until a player reconnects (PLAN.md 6.2). */
  private paused = false;

  constructor(
    private readonly getSeated: () => EnginePlayer[],
    private settings: RoomSettings,
    private readonly emit: (event: EngineEvent) => void,
    opts: EngineOptions = {},
  ) {
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
    this.queue = orderPlayersFromFirstRollerSeat(able, this.lastFirstRollerSeat);
    this.rememberFirstRoller(this.queue[0] ?? null);
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
    this.queue = orderPlayersFromFirstRollerSeat(tied, this.lastFirstRollerSeat);
    this.rememberFirstRoller(this.queue[0] ?? null);

    this.emit({ type: 'subRoundStarted', tiedPlayerIds: tiedIds, anteAmount, depth, antes });
    this.emit({ type: 'stateChanged' });
    this.nextTurn();
  }

  private rememberFirstRoller(player: EnginePlayer | null): void {
    if (player?.seat != null) this.lastFirstRollerSeat = player.seat;
  }

  private nextTurn(): void {
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
      straightPaid: false,
      restPose: null,
    };
    this.emit({ type: 'stateChanged' });

    if (!player.connected) {
      this.forceStand(player.id);
    }
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
   * the keep set and waits for `commitThrow`.
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
  commitThrow(playerId: PlayerId, dice: Die[], restPose?: BodyPose[]): EngineError | null {
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

    // Soft gate (ADR 005): a bad pose is dropped, never the throw — the dice
    // values stay authoritative (this also covers dev face overrides, whose
    // reported values intentionally disagree with the physics pose).
    let pose: BodyPose[] | null = null;
    if (restPose) {
      const reason = validateRestPose(restPose, dice);
      if (reason === null) pose = restPose;
      else console.warn(`rest pose dropped for ${playerId}: ${reason}`);
    }

    this.clearPendingThrow();
    return this.settleRoll(turn, dice, pending.keepIndices, pose);
  }

  /** Log replay (PLAN.md Phase 6): re-apply a recorded `rolled` event verbatim. */
  replayRolled(
    playerId: PlayerId,
    dice: Die[],
    kept: number[],
    restPose: BodyPose[] | null,
  ): EngineError | null {
    const turn = this.guardTurn(playerId);
    if ('code' in turn) return turn;
    return this.settleRoll(turn, dice, kept, restPose);
  }

  /**
   * Apply settled faces to the turn — the single dice entry point for the live
   * physics path and log replay, so the straight payout and auto-stand fire
   * identically in both. `restPose` must be set on the turn before the roll-cap
   * auto-stand below, so a capping roll carries its pose into rollToBeat.
   */
  private settleRoll(
    turn: CurrentTurn,
    dice: Die[],
    kept: number[],
    restPose: BodyPose[] | null,
  ): EngineError | null {
    turn.dice = [...dice];
    turn.rollsUsed += 1;
    turn.keptIndices = [...kept];
    turn.restPose = restPose ? restPose.map((p): BodyPose => [...p]) : null;
    this.emit({
      type: 'rolled',
      playerId: turn.playerId,
      dice: [...turn.dice],
      rollNumber: turn.rollsUsed,
      kept: [...turn.keptIndices],
      restPose: turn.restPose,
    });
    this.applyStraightPayout(turn);

    if (turn.rollsUsed >= turn.rollCap) return this.stand(turn.playerId);
    this.emit({ type: 'stateChanged' });
    return null;
  }

  private clearPendingThrow(): void {
    this.pendingThrow = null;
  }

  /**
   * Player-requested stand: rejected while the current hand loses to the
   * roll-to-beat (shared `canStandVoluntarily` — ties are allowed). Forced
   * stands (roll cap, keep-all, disconnect/kick) call `stand` directly.
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
      this.rollToBeat = { playerId, score, dice: [...turn.dice], restPose: turn.restPose };
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

    const perPlayer = config.amountPerPlayer;
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
   * Auto-resolve a turn on disconnect or kick. With settled dice the
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
          throwing: this.pendingThrow !== null,
          restPose: this.currentTurn.restPose
            ? this.currentTurn.restPose.map((p): BodyPose => [...p])
            : null,
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
            restPose: this.rollToBeat.restPose
              ? this.rollToBeat.restPose.map((p): BodyPose => [...p])
              : null,
          }
        : null,
      subRound: this.subRound
        ? { ...this.subRound, participantIds: [...this.subRound.participantIds] }
        : null,
    };
  }

  // -- persistence (PLAN.md Phase 6) -------------------------------------------------

  /** State that survives round-end compaction. Only meaningful in `roundEnd`. */
  persistedState(): { roundNumber: number; pot: number; lastFirstRollerSeat: number | null } {
    return {
      roundNumber: this.roundNumber,
      pot: this.pot,
      lastFirstRollerSeat: this.lastFirstRollerSeat,
    };
  }

  /** Restore from a compaction snapshot (always taken at a round boundary). */
  restore(state: {
    roundNumber: number;
    pot: number;
    lastFirstRollerSeat?: number | null;
    /** @deprecated pre-turn-order-rule snapshots; ignored. */
    lastWinnerId?: PlayerId | null;
  }): void {
    this.roundNumber = state.roundNumber;
    this.pot = state.pot;
    this.lastFirstRollerSeat = state.lastFirstRollerSeat ?? null;
    this.phase = 'roundEnd';
  }

  /** Cancel the round-end delay and begin the next round now (replay path). */
  advanceRound(): void {
    if (this.roundTimer) clearTimeout(this.roundTimer);
    this.roundTimer = null;
    this.startRound();
  }

  /** Freeze round-end scheduling after a replay; the room resumes on the first rejoin. */
  pause(): void {
    this.paused = true;
    this.clearPendingThrow();
    if (this.roundTimer) clearTimeout(this.roundTimer);
    this.roundTimer = null;
  }

  /** Wake a recovered engine: resume the current turn, or schedule the next round. */
  resume(): void {
    if (!this.paused) return;
    this.paused = false;
    if (this.currentTurn) {
      this.emit({ type: 'stateChanged' });
    } else if (this.phase === 'roundEnd') {
      this.roundTimer = setTimeout(() => this.startRound(), this.roundEndDelayMs);
      this.roundTimer.unref?.();
    }
  }

  // -- lifecycle --------------------------------------------------------------------

  stop(): void {
    this.clearPendingThrow();
    if (this.roundTimer) clearTimeout(this.roundTimer);
    this.roundTimer = null;
  }
}
