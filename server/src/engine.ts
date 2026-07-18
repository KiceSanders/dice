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
  effectiveMultiplier,
  HAND_SIZE,
  mustAutoStandLastPlayerBeat,
  orderPlayersFromFirstRollerSeat,
  resolveRound,
  scoreHand,
  yahtzeeBonusTarget,
} from '@dice/shared';
import { DelayedActions } from './delayedAction.js';
import { applyFirstRollYahtzeePayout } from './firstRollYahtzeePayout.js';
import { collectSidePayment, donateToClassicPot, winClassicPot } from './rollSideEffects.js';
import {
  softGateRestPose,
  validateCommitDice,
  validateKeepIndices,
  validateKeptUnchanged,
} from './throwLifecycle.js';

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
  /** The configured quiet window elapsed; outcome events follow this marker. */
  | { type: 'rollResolved'; playerId: PlayerId; dice: Die[]; rollNumber: number }
  | {
      type: 'stood';
      playerId: PlayerId;
      dice: Die[];
      score: HandScore;
      /** Final display pose at stand time, if available (ADR 005). */
      restPose: BodyPose[] | null;
    }
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
  /** First-roll four-of-a-kind donation into the Classic Pot. */
  | {
      type: 'classicDonated';
      playerId: PlayerId;
      amount: number;
      classicPot: number;
    }
  /** Classic (first-roll three 6s while roll-to-beat unset) wins the Classic Pot. */
  | {
      type: 'classicWon';
      playerId: PlayerId;
      amount: number;
    }
  /** A Yahtzee settled: the roller owes a temporary sixth-die throw (docs/GAME_RULES.md). */
  | { type: 'bonusOffered'; playerId: PlayerId; face: Die }
  | { type: 'bonusThrowStarted'; playerId: PlayerId }
  /** Persist the settled bonus face immediately, without revealing its outcome yet. */
  | { type: 'bonusSettled'; playerId: PlayerId; die: Die }
  /** The bonus delay elapsed. matched = die === face (a rolled 1 is NOT wild here). */
  | { type: 'bonusRolled'; playerId: PlayerId; die: Die; face: Die; matched: boolean }
  /** Yahtzee bonus hit: every other seated player paid the roller. */
  | {
      type: 'yahtzeeBonusPaid';
      playerId: PlayerId;
      amountPerPlayer: number;
      total: number;
      payments: { playerId: PlayerId; amount: number }[];
    }
  /** First-roll Yahtzee instant payout: every other seated player paid the roller. */
  | {
      type: 'firstRollYahtzeePaid';
      playerId: PlayerId;
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

function cloneRestPose(restPose: BodyPose[] | null): BodyPose[] | null {
  return restPose ? restPose.map((p): BodyPose => [...p]) : null;
}

export interface EngineOptions {
  roundEndDelayMs?: number;
  /** Test-only override; live games read RoomSettings.afterRollDelayMs per roll. */
  afterRollDelayMs?: number;
}

export const ROUND_END_DELAY_MS = 8_000;
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
  /** Awaiting/streaming the temporary sixth die. Null = no bonus in play. */
  bonus: { face: Die; throwing: boolean } | null;
  /** A Yahtzee already offered the bonus this turn (mirrors straightPaid). */
  bonusOffered: boolean;
  /** Validated rest pose of the latest roll (canonical space, ADR 005). */
  restPose: BodyPose[] | null;
}

interface SettledRollResolution {
  dice: Die[];
  rollNumber: number;
  score: HandScore;
  straightKind: StraightKind;
  straightAwarded: boolean;
  classicWinEligible: boolean;
  bonusFace: Die | null;
  bonusAwarded: boolean;
  atRollCap: boolean;
  /** Last player already beat roll-to-beat — stand after the quiet window. */
  lastPlayerBeat: boolean;
}

/**
 * Socket-free round/turn state machine (rules: docs/GAME_RULES.md). The room layer
 * owns membership; the engine owns rounds, sub-rounds, turns, dice, pot,
 * classic pot, chips, and side payouts. Dice values come exclusively from the roller's
 * physics sim (ADR 004) — the engine never rolls.
 */
export class GameEngine {
  phase: 'playing' | 'roundEnd' | 'ended' = 'playing';
  roundNumber = 0;
  pot = 0;
  /** Side pool for Classic Pot (docs/GAME_RULES.md); separate from `pot`. */
  classicPot = 0;

  private participants: EnginePlayer[] = [];
  private queue: EnginePlayer[] = [];
  private currentTurn: CurrentTurn | null = null;
  private hands = new Map<PlayerId, { score: HandScore; dice: Die[] }>();
  private rollToBeat: {
    playerIds: PlayerId[];
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
  private readonly afterRollDelayMsOverride: number | undefined;
  private readonly postRoll = new DelayedActions();
  private forceStandAfterRoll = false;
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
    this.afterRollDelayMsOverride = opts.afterRollDelayMs;
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

  /**
   * Stake multiplier for a round (docs/GAME_RULES.md "Stakes: multiplier and
   * auto-raise"): scales the ante and every instant side bet.
   */
  private stakeMultiplier(roundNumber = this.roundNumber): number {
    return effectiveMultiplier(this.settings, roundNumber);
  }

  private startRound(): void {
    // roundNumber increments below, so the new round's stakes use +1.
    const ante = this.settings.chipsPerRound * this.stakeMultiplier(this.roundNumber + 1);
    const seated = this.getSeated().filter((p) => p.seat !== null);

    // Zero-chip players sit out; everyone else antes the same short-stack floor.
    const able = seated.filter((p) => p.chips > 0);
    if (able.length < 2) {
      this.end('not enough players can cover the ante');
      return;
    }

    const effectiveAnte = Math.min(ante, ...able.map((p) => p.chips));
    for (const p of able) p.chips -= effectiveAnte;
    this.pot += able.length * effectiveAnte;
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
      antes: able.map((p) => ({ playerId: p.id, amount: effectiveAnte })),
    });
    this.emit({ type: 'stateChanged' });
    this.nextTurn();
  }

  /**
   * Tie → sub-round among only the tied players, same pot, ante doubling each
   * level (chipsPerRound * 2^depth, equal floor to the shortest tied stack).
   * Past MAX_SUBROUND_DEPTH: sudden death — no ante, single roll each, repeat
   * until broken.
   */
  private startSubRound(tiedIds: PlayerId[]): void {
    const depth = (this.subRound?.depth ?? 0) + 1;
    const suddenDeath = depth > MAX_SUBROUND_DEPTH;
    const tied = this.participants.filter((p) => tiedIds.includes(p.id));

    let anteAmount = 0;
    const antes: { playerId: PlayerId; amount: number }[] = [];
    if (!suddenDeath) {
      anteAmount = this.settings.chipsPerRound * this.stakeMultiplier() * 2 ** depth;
      const effectiveAnte = Math.min(anteAmount, ...tied.map((p) => p.chips));
      for (const p of tied) {
        p.chips -= effectiveAnte;
        this.pot += effectiveAnte;
        antes.push({ playerId: p.id, amount: effectiveAnte });
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
      bonus: null,
      bonusOffered: false,
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
    if (this.postRoll.koozieBlockedFor(turn)) {
      return err('BAD_REQUEST', 'the koozie is still locked');
    }
    if (this.pendingThrow) return err('BAD_REQUEST', 'a throw is already in flight');
    if (turn.bonus) return err('BAD_REQUEST', 'resolve the bonus throw first');

    if (turn.dice === null) {
      if (keepIndices.length > 0) return err('BAD_REQUEST', 'nothing to keep on the first roll');
    } else {
      const valid = validateKeepIndices(keepIndices);
      if (valid) return err(valid.code, valid.message);
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
    const diceErr = validateCommitDice(dice);
    if (diceErr) return err(diceErr.code, diceErr.message);
    if (turn.dice !== null) {
      const keptErr = validateKeptUnchanged(turn.dice, dice, pending.keepIndices);
      if (keptErr) return err(keptErr.code, keptErr.message);
    }

    // Soft gate (ADR 005): a bad pose is dropped, never the throw — the dice
    // values stay authoritative (this also covers dev face overrides, whose
    // reported values intentionally disagree with the physics pose).
    const pose = softGateRestPose(restPose, dice, (reason) => {
      console.warn(`rest pose dropped for ${playerId}: ${reason}`);
    });

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
    return this.settleRoll(turn, dice, kept, restPose, false);
  }

  /**
   * Apply settled faces to the turn. Live throws publish the dice immediately,
   * then hold every outcome behind the configured after-roll delay. Replay
   * resolves synchronously so persisted events can be reduced in log order.
   */
  private settleRoll(
    turn: CurrentTurn,
    dice: Die[],
    kept: number[],
    restPose: BodyPose[] | null,
    delayConsequences = true,
  ): EngineError | null {
    turn.dice = [...dice];
    turn.rollsUsed += 1;
    turn.keptIndices = [...kept];
    turn.restPose = cloneRestPose(restPose);
    const settings = this.settings;
    const seated = this.getSeated().filter((player) => player.seat !== null);
    const score = this.scoreFor(turn);
    const straightKind = detectStraight(turn.dice);
    const straightAwarded = !turn.straightPaid && straightKind !== 'none';
    if (straightAwarded) turn.straightPaid = true;
    const bonusFace = yahtzeeBonusTarget(score);
    const bonusAwarded = !turn.bonusOffered && bonusFace !== null;
    if (bonusAwarded) turn.bonusOffered = true;
    const lastPlayerBeat = mustAutoStandLastPlayerBeat(
      turn.dice,
      turn.rollsUsed,
      this.rollToBeat?.score ?? null,
      this.queue.length === 0,
    );
    const resolution: SettledRollResolution = {
      dice: [...turn.dice],
      rollNumber: turn.rollsUsed,
      score: { ...score },
      straightKind,
      straightAwarded,
      classicWinEligible: this.rollToBeat === null,
      bonusFace,
      bonusAwarded,
      atRollCap: turn.rollsUsed >= turn.rollCap,
      lastPlayerBeat,
    };
    const blocksKoozie =
      resolution.atRollCap ||
      resolution.lastPlayerBeat ||
      (resolution.bonusAwarded && settings.yahtzeeBonus.enabled);
    const delayedId = delayConsequences ? this.postRoll.arm(turn, blocksKoozie) : null;
    this.emit({
      type: 'rolled',
      playerId: turn.playerId,
      dice: [...turn.dice],
      rollNumber: turn.rollsUsed,
      kept: [...turn.keptIndices],
      restPose: turn.restPose,
    });
    const resolve = () => this.resolveRoll(turn, resolution, settings, seated);
    if (!delayConsequences) resolve();
    else if (delayedId !== null) {
      const delayMs = this.afterRollDelayMsOverride ?? settings.afterRollDelayMs;
      this.postRoll.releaseAfter(delayedId, delayMs, resolve);
    }
    return null;
  }

  private resolveRoll(
    turn: CurrentTurn,
    resolution: SettledRollResolution,
    settings: RoomSettings,
    seated: EnginePlayer[],
  ): void {
    this.emit({
      type: 'rollResolved',
      playerId: turn.playerId,
      dice: [...resolution.dice],
      rollNumber: resolution.rollNumber,
    });
    // Instant side-bet amounts scale with the round's stake multiplier. The
    // classic *win* pays the whole accumulated pool, so only the donation scales.
    const stakes = this.stakeMultiplier();
    this.applyStraightPayout(
      turn,
      resolution,
      {
        ...settings.straightPayout,
        amountPerPlayer: settings.straightPayout.amountPerPlayer * stakes,
      },
      seated,
    );
    this.applyClassicDonation(turn, resolution, {
      ...settings.classicPot,
      donationAmount: settings.classicPot.donationAmount * stakes,
    });
    this.applyClassicPayout(turn, resolution, settings.classicPot);
    const firstRollYahtzeePayout = applyFirstRollYahtzeePayout(
      {
        ...settings.firstRollYahtzeePayout,
        amountPerPlayer: settings.firstRollYahtzeePayout.amountPerPlayer * stakes,
      },
      resolution.score,
      this.participantById(turn.playerId),
      seated,
    );
    if (firstRollYahtzeePayout)
      this.emit({ type: 'firstRollYahtzeePaid', ...firstRollYahtzeePayout });

    // A turn can already have advanced when a newer roll used a shorter delay.
    // Its snapshotted side effects still apply, but it cannot mutate the new turn.
    if (this.currentTurn !== turn) {
      this.emit({ type: 'stateChanged' });
      return;
    }

    if (this.forceStandAfterRoll) {
      if (!this.postRoll.pendingFor(turn)) {
        this.forceStandAfterRoll = false;
        this.standNow(turn);
      } else {
        this.emit({ type: 'stateChanged' });
      }
      return;
    }
    const bonusOffered = this.offerYahtzeeBonus(
      turn,
      settings.yahtzeeBonus,
      resolution.bonusAwarded ? resolution.bonusFace : null,
    );
    if (!bonusOffered && (resolution.atRollCap || resolution.lastPlayerBeat)) {
      this.standNow(turn);
      return;
    }
    this.emit({ type: 'stateChanged' });
  }

  private clearPendingThrow(): void {
    this.pendingThrow = null;
  }

  /**
   * Player-requested stand: rejected while the current hand loses to the
   * roll-to-beat (shared `canStandVoluntarily` — ties are allowed). Forced
   * stands (roll cap, last-player beat, keep-all, disconnect/kick) call
   * `stand` / `standNow` directly.
   */
  standVoluntarily(playerId: PlayerId, restPose?: BodyPose[]): EngineError | null {
    const turn = this.guardTurn(playerId);
    if ('code' in turn) return turn;
    if (this.postRoll.pendingFor(turn)) return err('BAD_REQUEST', 'the roll is still resolving');
    if (this.pendingThrow) return err('BAD_REQUEST', 'a throw is in flight');
    if (turn.dice === null) return err('BAD_REQUEST', 'roll before standing');
    if (turn.bonus) return err('STAND_NOT_ALLOWED', 'throw the bonus die first');
    if (!canStandVoluntarily(turn.dice, turn.rollsUsed, this.rollToBeat?.score ?? null)) {
      return err('STAND_NOT_ALLOWED', 'beat or tie the roll to beat, or keep rolling');
    }
    return this.stand(playerId, restPose);
  }

  stand(playerId: PlayerId, restPose?: BodyPose[]): EngineError | null {
    const turn = this.guardTurn(playerId);
    if ('code' in turn) return turn;
    if (this.postRoll.pendingFor(turn)) return err('BAD_REQUEST', 'the roll is still resolving');
    if (this.pendingThrow) return err('BAD_REQUEST', 'a throw is in flight');
    if (turn.dice === null) return err('BAD_REQUEST', 'roll before standing');

    return this.standNow(turn, restPose);
  }

  private standNow(turn: CurrentTurn, restPose?: BodyPose[]): EngineError | null {
    const playerId = turn.playerId;
    if (this.currentTurn !== turn) return err('NOT_YOUR_TURN', 'it is not your turn');
    if (this.pendingThrow) return err('BAD_REQUEST', 'a throw is in flight');
    if (turn.dice === null) return err('BAD_REQUEST', 'roll before standing');

    if (restPose !== undefined) {
      const pose = softGateRestPose(restPose, turn.dice, (reason) => {
        console.warn(`stand rest pose dropped for ${playerId}: ${reason}`);
      });
      if (pose) turn.restPose = cloneRestPose(pose);
    }

    const score = this.scoreFor(turn);
    this.hands.set(playerId, { score, dice: [...turn.dice] });
    this.emit({
      type: 'stood',
      playerId,
      dice: [...turn.dice],
      score: { ...score },
      restPose: cloneRestPose(turn.restPose),
    });

    if (this.rollToBeat === null || compareHands(score, this.rollToBeat.score) > 0) {
      this.rollToBeat = {
        playerIds: [playerId],
        score,
        dice: [...turn.dice],
        restPose: cloneRestPose(turn.restPose),
      };
    } else if (compareHands(score, this.rollToBeat.score) === 0) {
      if (!this.rollToBeat.playerIds.includes(playerId)) {
        this.rollToBeat.playerIds.push(playerId);
      }
    }
    if (this.roundRollCap === null) this.roundRollCap = turn.rollsUsed;

    this.nextTurn();
    return null;
  }

  /**
   * Instant straight side payment (docs/GAME_RULES.md "Straights"): the moment a roll
   * settles showing a straight, every other seated player pays the roller from
   * their own pile — each transfer is min(amount, payer stack). Short/broke rollers
   * still collect in full from solvent payers. Zero-sum, pot untouched, at most
   * once per turn. The turn then continues as normal.
   */
  private applyStraightPayout(
    turn: CurrentTurn,
    resolution: SettledRollResolution,
    config: RoomSettings['straightPayout'],
    seated: EnginePlayer[],
  ): void {
    if (!resolution.straightAwarded || resolution.straightKind === 'none') return;
    if (!config.enabled) return;
    const roller = this.participantById(turn.playerId);
    if (!roller) return;

    const perPlayer = config.amountPerPlayer;
    if (perPlayer <= 0) return;

    const { total, payments } = collectSidePayment(roller, seated, perPlayer);

    this.emit({
      type: 'straightPaid',
      playerId: turn.playerId,
      kind: resolution.straightKind,
      amountPerPlayer: perPlayer,
      total,
      payments,
    });
  }

  /**
   * First-roll four-of-a-kind donation into the Classic Pot
   * (docs/GAME_RULES.md "Classic Pot"). Exact count === 4 (wilds OK).
   */
  private applyClassicDonation(
    turn: CurrentTurn,
    resolution: SettledRollResolution,
    config: RoomSettings['classicPot'],
  ): void {
    if (resolution.rollNumber !== 1) return;
    const roller = this.participantById(turn.playerId);
    if (!roller) return;
    const result = donateToClassicPot(config, resolution.score, roller, this.classicPot);
    if (!result) return;
    this.classicPot = result.classicPot;
    this.emit({
      type: 'classicDonated',
      playerId: turn.playerId,
      amount: result.amount,
      classicPot: this.classicPot,
    });
  }

  /**
   * Classic win: first-roll three 6s while roll-to-beat is still unset
   * (docs/GAME_RULES.md "Classic Pot").
   */
  private applyClassicPayout(
    turn: CurrentTurn,
    resolution: SettledRollResolution,
    config: RoomSettings['classicPot'],
  ): void {
    if (!resolution.classicWinEligible) return;
    const roller = this.participantById(turn.playerId);
    if (!roller) return;
    const result = winClassicPot(config, resolution.score, roller, this.classicPot);
    if (!result) return;
    this.classicPot = 0;
    this.emit({
      type: 'classicWon',
      playerId: turn.playerId,
      amount: result.amount,
    });
  }

  /**
   * Yahtzee bonus offer (docs/GAME_RULES.md "Yahtzee bonus"): a settled quint
   * (wilds count) owes a temporary sixth-die throw before auto-standing.
   * Latches once per turn like the straight payout. Returns true when a bonus
   * is now pending.
   */
  private offerYahtzeeBonus(
    turn: CurrentTurn,
    config: RoomSettings['yahtzeeBonus'],
    face: Die | null,
  ): boolean {
    if (face === null) return false;
    if (!config.enabled) return false;
    turn.bonus = { face, throwing: false };
    this.emit({ type: 'bonusOffered', playerId: turn.playerId, face });
    return true;
  }

  /** Bonus throw, phase 1: the koozie is released with the temporary sixth die. */
  beginBonusThrow(playerId: PlayerId): EngineError | null {
    const turn = this.guardTurn(playerId);
    if ('code' in turn) return turn;
    if (!turn.bonus) return err('BAD_REQUEST', 'no bonus throw pending');
    if (turn.bonus.throwing || this.pendingThrow) {
      return err('BAD_REQUEST', 'a throw is already in flight');
    }
    turn.bonus.throwing = true;
    this.emit({ type: 'bonusThrowStarted', playerId });
    this.emit({ type: 'stateChanged' });
    return null;
  }

  /**
   * Bonus throw, phase 2: the single die settled. A literal face match (a
   * rolled 1 is NOT wild here) pays the roller; either way the player then
   * stands automatically on the Yahtzee.
   */
  commitBonusThrow(playerId: PlayerId, die: Die): EngineError | null {
    const turn = this.guardTurn(playerId);
    if ('code' in turn) return turn;
    if (!turn.bonus?.throwing) return err('BAD_REQUEST', 'no bonus throw in flight');
    if (!Number.isInteger(die) || die < 1 || die > 6) {
      return err('BAD_REQUEST', 'die must be an integer in [1, 6]');
    }
    return this.settleBonusRoll(turn, die, true);
  }

  /** Log replay (PLAN.md Phase 6): re-apply a recorded bonus die verbatim. */
  replayBonusRolled(playerId: PlayerId, die: Die): EngineError | null {
    const turn = this.guardTurn(playerId);
    if ('code' in turn) return turn;
    if (!turn.bonus) return err('BAD_REQUEST', 'no bonus throw pending');
    turn.bonus.throwing = true;
    return this.settleBonusRoll(turn, die, false);
  }

  private settleBonusRoll(
    turn: CurrentTurn,
    die: Die,
    delayConsequences: boolean,
  ): EngineError | null {
    if (!turn.bonus) return err('BAD_REQUEST', 'no bonus throw pending');
    const { face } = turn.bonus;
    const config = this.settings.yahtzeeBonus;
    const seated = this.getSeated().filter((player) => player.seat !== null);
    turn.bonus.throwing = false;
    const delayedId = delayConsequences ? this.postRoll.arm(turn, true) : null;
    if (delayConsequences) {
      this.emit({ type: 'bonusSettled', playerId: turn.playerId, die });
      this.emit({ type: 'stateChanged' });
    }
    const resolve = () => {
      if (this.currentTurn !== turn) return;
      turn.bonus = null;
      const matched = die === face;
      this.emit({ type: 'bonusRolled', playerId: turn.playerId, die, face, matched });
      if (matched) this.applyYahtzeeBonusPayout(turn, config, seated);
      this.forceStandAfterRoll = false;
      this.standNow(turn);
    };
    if (!delayConsequences) resolve();
    else if (delayedId !== null) {
      const delayMs = this.afterRollDelayMsOverride ?? this.settings.afterRollDelayMs;
      this.postRoll.releaseAfter(delayedId, delayMs, resolve);
    }
    return null;
  }

  /**
   * Yahtzee bonus payout: mirrors applyStraightPayout — every other seated
   * player pays min(amount, payer stack). Zero-sum, pot untouched. Settings
   * re-read here so a mid-bonus toggle-off pays nothing.
   */
  private applyYahtzeeBonusPayout(
    turn: CurrentTurn,
    config: RoomSettings['yahtzeeBonus'],
    seated: EnginePlayer[],
  ): void {
    if (!config.enabled || config.amountPerPlayer <= 0) return;
    const roller = this.participantById(turn.playerId);
    if (!roller) return;

    const perPlayer = config.amountPerPlayer * this.stakeMultiplier();
    const { total, payments } = collectSidePayment(roller, seated, perPlayer);

    this.emit({
      type: 'yahtzeeBonusPaid',
      playerId: turn.playerId,
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
    if (this.postRoll.pendingFor(turn)) {
      this.forceStandAfterRoll = true;
      this.clearPendingThrow();
      return;
    }
    // A pending physics result is abandoned; the forced outcome wins.
    this.clearPendingThrow();
    if (turn.dice === null) {
      this.emit({ type: 'forfeited', playerId });
      this.nextTurn();
      return;
    }
    this.standNow(turn);
  }

  private guardTurn(playerId: PlayerId): CurrentTurn | EngineError {
    if (this.phase !== 'playing') return err('BAD_REQUEST', 'no round in progress');
    if (!this.currentTurn || this.currentTurn.playerId !== playerId) {
      return err('NOT_YOUR_TURN', 'it is not your turn');
    }
    return this.currentTurn;
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
          throwing: this.pendingThrow !== null || (this.currentTurn.bonus?.throwing ?? false),
          resolving: this.postRoll.pendingFor(this.currentTurn),
          koozieLocked: this.postRoll.koozieBlockedFor(this.currentTurn),
          bonusPending: this.currentTurn.bonus ? { face: this.currentTurn.bonus.face } : null,
          restPose: this.currentTurn.restPose
            ? this.currentTurn.restPose.map((p): BodyPose => [...p])
            : null,
        }
      : null;

    return {
      roundNumber: this.roundNumber,
      pot: this.pot,
      classicPot: this.classicPot,
      turnQueue: this.queue.map((p) => p.id),
      currentTurn: turn,
      rollToBeat: this.rollToBeat
        ? {
            playerIds: [...this.rollToBeat.playerIds],
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
  persistedState(): {
    roundNumber: number;
    pot: number;
    classicPot: number;
    lastFirstRollerSeat: number | null;
  } {
    return {
      roundNumber: this.roundNumber,
      pot: this.pot,
      classicPot: this.classicPot,
      lastFirstRollerSeat: this.lastFirstRollerSeat,
    };
  }

  /** Restore from a compaction snapshot (always taken at a round boundary). */
  restore(state: {
    roundNumber: number;
    pot: number;
    classicPot?: number;
    lastFirstRollerSeat?: number | null;
  }): void {
    this.roundNumber = state.roundNumber;
    this.pot = state.pot;
    this.classicPot = state.classicPot ?? 0;
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
    this.postRoll.cancel();
    this.forceStandAfterRoll = false;
    // An in-flight bonus throw is abandoned like pendingThrow; the bonus
    // itself stays owed so the rejoining roller throws again.
    if (this.currentTurn?.bonus) this.currentTurn.bonus.throwing = false;
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
    this.postRoll.cancel();
    this.forceStandAfterRoll = false;
    if (this.roundTimer) clearTimeout(this.roundTimer);
    this.roundTimer = null;
  }
}
