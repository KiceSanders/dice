import type {
  BetALotLadderRoll,
  BetALotRoundResult,
  BetALotSettings,
  BodyPose,
  Die,
  PlayerId,
} from '@dice/shared';
import {
  allSameExtraPayoutForDiceCount,
  BETALOT_ROUND_HISTORY_MAX,
  lossPayoutForDiceCount,
  requiresExtraRoll,
  sumDice,
  validateRestPose,
} from '@dice/shared';
import type { EnginePlayer } from '../../engine.js';
import type { BetALotEvent } from './events.js';
import { BetALotPayments } from './payments.js';
import {
  type BetALotExtraRollState,
  type BetALotPersistedState,
  type BetALotPhase,
  buildPublicState,
  cloneLadder,
  clonePose,
  readPersistedState,
} from './state.js';
import { BetALotTiming } from './timing.js';

export type { BetALotEvent } from './events.js';
export type { BetALotPersistedState } from './state.js';

export type BetALotError = {
  code: 'NOT_YOUR_TURN' | 'BAD_REQUEST';
  message: string;
};

const error = (code: BetALotError['code'], message: string): BetALotError => ({ code, message });

/**
 * Socket-free authoritative state machine for the heads-up Bet-a-lot ladder.
 * It deliberately never generates dice; the current roller reports physics
 * results, just like the existing game engine.
 */
export class BetALotEngine {
  phase: BetALotPhase = 'playing';
  roundNumber = 0;
  currentTurnPlayerId: PlayerId | null = null;
  private players: EnginePlayer[] = [];
  private openerId = '';
  private opponentId = '';
  private rung = 1;
  private pendingCall: Die | null = null;
  private throwing = false;
  private resolving = false;
  private extraRoll: BetALotExtraRollState | null = null;
  private ladder: BetALotLadderRoll[] = [];
  private roundHistory: BetALotRoundResult[] = [];
  private readonly payments = new BetALotPayments(
    () => this.players,
    (playerId) => this.other(playerId),
    (event) => this.emit(event),
  );
  private readonly timing = new BetALotTiming();
  private pendingSettings: BetALotSettings | null = null;

  constructor(
    private readonly getPlayers: () => EnginePlayer[],
    private settings: BetALotSettings,
    private readonly emit: (event: BetALotEvent) => void,
  ) {}

  start(): void {
    this.startRound();
  }

  updateSettings(settings: BetALotSettings): void {
    this.settings = settings;
  }

  beginThrow(playerId: PlayerId): BetALotError | null {
    if (this.phase !== 'playing') return error('BAD_REQUEST', 'round is not active');
    if (playerId !== this.currentTurnPlayerId) return error('NOT_YOUR_TURN', 'it is not your turn');
    if (this.throwing || this.resolving || this.extraRoll)
      return error('BAD_REQUEST', 'throw is unavailable');
    if (this.rung === 1 && this.pendingCall === null) {
      return error('BAD_REQUEST', 'call a face before the opening throw');
    }
    this.throwing = true;
    this.emit({
      type: 'throwStarted',
      playerId,
      diceCount: this.rung,
      rung: this.rung,
      extra: false,
    });
    this.emit({ type: 'stateChanged' });
    return null;
  }

  call(playerId: PlayerId, face: Die): BetALotError | null {
    if (this.phase !== 'playing' || this.rung !== 1 || this.ladder.length !== 0) {
      return error('BAD_REQUEST', 'a call is only allowed before the opening throw');
    }
    if (playerId !== this.openerId || this.throwing)
      return error('NOT_YOUR_TURN', 'only the opener may call');
    this.pendingCall = face;
    this.emit({ type: 'stateChanged' });
    return null;
  }

  commitThrow(playerId: PlayerId, dice: Die[], restPose?: BodyPose[]): BetALotError | null {
    if (!this.throwing || playerId !== this.currentTurnPlayerId) {
      return error('NOT_YOUR_TURN', 'no throw is pending for this player');
    }
    if (dice.length !== this.rung || !dice.every((die) => die >= 1 && die <= 6)) {
      return error('BAD_REQUEST', `expected exactly ${this.rung} dice`);
    }

    this.throwing = false;
    this.resolving = true;
    const settings = this.settings;
    this.pendingSettings = settings;
    const score = sumDice(dice);
    const pose =
      restPose?.length === dice.length && validateRestPose(restPose, dice) === null
        ? clonePose(restPose)
        : null;
    const roll: BetALotLadderRoll = {
      rung: this.rung,
      playerId,
      dice: [...dice],
      score,
      restPose: pose,
    };
    this.ladder.push(roll);
    this.emit({
      type: 'rolled',
      playerId,
      dice: [...dice],
      score,
      rung: this.rung,
      restPose: pose,
    });
    this.emit({ type: 'stateChanged' });
    this.timing.scheduleResolution(settings.afterRollDelayMs, () =>
      this.resolveNormalRoll(playerId, [...dice], score, settings),
    );
    return null;
  }

  beginExtraThrow(playerId: PlayerId): BetALotError | null {
    const extra = this.extraRoll;
    if (!extra || extra.playerId !== playerId)
      return error('NOT_YOUR_TURN', 'no extra throw is pending');
    if (this.throwing || this.resolving || extra.settledDie !== null) {
      return error('BAD_REQUEST', 'throw already in progress');
    }
    this.throwing = true;
    this.emit({
      type: 'throwStarted',
      playerId,
      diceCount: 1,
      rung: this.rung,
      extra: true,
    });
    this.emit({ type: 'stateChanged' });
    return null;
  }

  commitExtraThrow(playerId: PlayerId, die: Die, restPose?: BodyPose[]): BetALotError | null {
    const extra = this.extraRoll;
    if (!extra || !this.throwing || extra.playerId !== playerId) {
      return error('NOT_YOUR_TURN', 'no extra throw is pending');
    }
    this.throwing = false;
    this.resolving = true;
    const settings = this.settings;
    this.pendingSettings = settings;
    extra.settledDie = die;
    const matched = die === extra.face;
    const pose =
      restPose?.length === 1 && validateRestPose(restPose, [die]) === null
        ? clonePose(restPose)
        : null;
    this.emit({
      type: 'extraRolled',
      playerId,
      die,
      target: extra.face,
      matched,
      sourceDiceCount: extra.sourceDiceCount,
      restPose: pose,
    });
    this.emit({ type: 'stateChanged' });
    this.timing.scheduleResolution(settings.afterRollDelayMs, () =>
      this.resolveExtraRoll(playerId, die, settings),
    );
    return null;
  }

  forceStand(playerId: PlayerId): void {
    if (playerId !== this.currentTurnPlayerId || this.phase !== 'playing') return;
    this.endRound(
      this.other(playerId),
      playerId,
      lossPayoutForDiceCount(this.settings, Math.max(2, this.rung)),
    );
  }

  continueRound(): void {
    if (this.phase !== 'roundEnd') return;
    this.timing.cancelRoundFallback();
    this.startRound();
  }

  publicState() {
    return buildPublicState({
      roundNumber: this.roundNumber,
      payments: this.payments,
      openerId: this.openerId,
      currentPlayerId: this.currentTurnPlayerId,
      rung: this.rung,
      pendingCall: this.pendingCall,
      throwing: this.throwing,
      resolving: this.resolving,
      extraRoll: this.extraRoll,
      ladder: this.ladder,
      roundHistory: this.roundHistory,
    });
  }

  persistedState() {
    return {
      publicState: this.publicState(),
      phase: this.phase,
      rung: this.rung,
      extraRoll: this.extraRoll ? { ...this.extraRoll } : null,
      pendingSettings: this.pendingSettings,
    } satisfies BetALotPersistedState;
  }

  restore(state: BetALotPersistedState | ReturnType<BetALotEngine['publicState']>): void {
    const persisted = readPersistedState(state, this.settings);
    const publicState = persisted.publicState;
    this.players = this.getPlayers()
      .filter((player) => player.seat !== null)
      .slice(0, 2);
    this.roundNumber = publicState.roundNumber;
    this.openerId = publicState.openerId;
    this.opponentId = this.players.find((player) => player.id !== publicState.openerId)?.id ?? '';
    this.currentTurnPlayerId = publicState.currentPlayerId;
    this.rung = persisted.rung;
    this.pendingCall = publicState.pendingCall;
    this.throwing = false;
    this.resolving = publicState.resolving;
    this.extraRoll = persisted.extraRoll ? { ...persisted.extraRoll } : null;
    this.ladder = cloneLadder(publicState.ladder);
    this.roundHistory = publicState.roundHistory.map((round) => ({ ...round }));
    this.payments.restore(publicState.sevensPot, publicState.fire);
    this.phase = persisted.phase;
    this.pendingSettings = persisted.pendingSettings;
    if (publicState.resolving) {
      const settings = this.pendingSettings ?? this.settings;
      const extraDie = this.extraRoll?.settledDie ?? null;
      if (extraDie !== null && this.currentTurnPlayerId) {
        this.resolveExtraRoll(this.currentTurnPlayerId, extraDie, settings);
      } else {
        const roll = this.ladder.at(-1);
        if (roll) this.resolveNormalRoll(roll.playerId, roll.dice, roll.score, settings);
      }
    }
  }

  pause(): void {
    this.timing.pause();
    this.throwing = false;
  }

  resume(): void {
    if (!this.timing.resume()) return;
    if (this.phase === 'roundEnd') this.scheduleRoundFallback();
    else this.emit({ type: 'stateChanged' });
  }

  private startRound(): void {
    this.players = this.getPlayers()
      .filter((player) => player.seat !== null)
      .slice(0, 2);
    if (this.players.length !== 2 || this.players.some((player) => player.chips <= 0)) {
      this.phase = 'ended';
      this.emit({ type: 'gameEnded', reason: 'a Bet-a-lot game needs two funded players' });
      return;
    }
    this.roundNumber += 1;
    const first = this.roundNumber === 1 ? this.players[0]! : this.other(this.openerId);
    this.openerId = typeof first === 'string' ? first : first.id;
    this.opponentId = this.players.find((player) => player.id !== this.openerId)!.id;
    this.rung = 1;
    this.pendingCall = null;
    this.throwing = false;
    this.resolving = false;
    this.extraRoll = null;
    this.pendingSettings = null;
    this.ladder = [];
    this.currentTurnPlayerId = this.openerId;
    this.phase = 'playing';
    this.emit({ type: 'stateChanged' });
  }

  private resolveNormalRoll(
    playerId: PlayerId,
    dice: Die[],
    score: number,
    settings: BetALotSettings,
  ): void {
    if (!this.resolving || this.phase !== 'playing') return;
    this.pendingSettings = null;
    this.payments.applyPerRollEffects({
      playerId,
      dice,
      score,
      rung: this.rung,
      pendingCall: this.pendingCall,
      settings,
    });
    if (this.rung === 1) this.pendingCall = null;
    if (this.endIfBankrupt()) return;
    if (requiresExtraRoll(dice)) {
      this.extraRoll = {
        playerId,
        face: dice[0]!,
        sourceDiceCount: dice.length,
        settledDie: null,
        basePayout: this.basePayoutFor(score, settings),
      };
      this.resolving = false;
      this.emit({ type: 'stateChanged' });
      return;
    }
    this.resolveLadderRoll(playerId, score, this.basePayoutFor(score, settings));
  }

  private resolveExtraRoll(playerId: PlayerId, die: Die, settings: BetALotSettings): void {
    const extra = this.extraRoll;
    if (!extra || extra.playerId !== playerId || extra.settledDie !== die) return;
    this.pendingSettings = null;
    if (die === extra.face) {
      this.payments.payOpponent(
        playerId,
        allSameExtraPayoutForDiceCount(settings, extra.sourceDiceCount),
        'allSameExtra',
      );
    }
    if (this.endIfBankrupt()) return;
    this.extraRoll = null;
    const roll = this.ladder.at(-1);
    if (roll) this.resolveLadderRoll(playerId, roll.score, extra.basePayout);
  }

  private basePayoutFor(score: number, settings: BetALotSettings): number {
    const prior = this.ladder[this.ladder.length - 2];
    if (prior && score <= prior.score) return lossPayoutForDiceCount(settings, this.rung);
    return this.rung === 6 ? settings.successfulRungSixPayout : 0;
  }

  private resolveLadderRoll(playerId: PlayerId, score: number, basePayout: number): void {
    this.resolving = false;
    const prior = this.ladder[this.ladder.length - 2];
    if (prior && score <= prior.score) {
      this.endRound(this.other(playerId), playerId, basePayout);
      return;
    }
    if (this.rung === 6) {
      this.endRound(this.opponentId, this.openerId, basePayout);
      return;
    }
    this.rung += 1;
    this.currentTurnPlayerId = this.other(playerId);
    this.emit({ type: 'stateChanged' });
  }

  private endRound(winnerId: PlayerId, loserId: PlayerId, baseAmount: number): void {
    const paid = this.payments.pay(loserId, winnerId, baseAmount, 'loss');
    this.roundHistory = [{ roundNumber: this.roundNumber, winnerId }, ...this.roundHistory].slice(
      0,
      BETALOT_ROUND_HISTORY_MAX,
    );
    this.phase = 'roundEnd';
    this.currentTurnPlayerId = null;
    this.emit({
      type: 'fireChanged',
      fire: this.payments.updateFire(winnerId, loserId),
    });
    this.emit({ type: 'roundEnded', winnerId, loserId, amount: paid });
    this.emit({ type: 'stateChanged' });
    if ((this.players.find((player) => player.id === loserId)?.chips ?? 0) === 0) {
      this.phase = 'ended';
      this.emit({ type: 'gameEnded', reason: 'a player ran out of chips' });
    } else {
      this.scheduleRoundFallback();
    }
  }

  private endIfBankrupt(): boolean {
    const loser = this.payments.bankruptPlayer();
    if (!loser) return false;
    this.extraRoll = null;
    this.resolving = false;
    this.endRound(this.other(loser.id), loser.id, 0);
    return true;
  }

  private scheduleRoundFallback(): void {
    if (this.phase === 'roundEnd') this.timing.scheduleRoundFallback(() => this.startRound());
  }

  private other(playerId: PlayerId): PlayerId {
    return playerId === this.openerId ? this.opponentId : this.openerId;
  }

  stop(): void {
    this.timing.stop();
  }
}
