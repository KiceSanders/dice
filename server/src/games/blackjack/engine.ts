import {
  type BlackjackSettings,
  type BlackjackStatePublic,
  type BodyPose,
  blackjackOutcome,
  blackjackPayout,
  type ErrorCode,
  isBlackjackDie,
  validatePolyhedralRestPose,
} from '@dice/shared';
import { DelayedActions } from '../../delayedAction.js';
import type { EnginePlayer } from '../../engine.js';

export type BlackjackEvent =
  | { type: 'throwStarted'; playerId: string }
  | { type: 'rolled'; playerId: string; die: number; total: number; restPose: BodyPose[] | null }
  | { type: 'roundEnded'; winnerId: string; loserId: string; amount: number }
  | { type: 'stateChanged' }
  | { type: 'gameEnded' };
export type BlackjackError = { code: ErrorCode; message: string };
export interface BlackjackPersistedState {
  publicState: BlackjackStatePublic;
  phase: 'playing' | 'roundEnd' | 'ended';
  forcedPlayerId: string | null;
}

export class BlackjackEngine {
  phase: BlackjackPersistedState['phase'] = 'playing';
  private players: EnginePlayer[] = [];
  private state: BlackjackStatePublic = {
    kind: 'blackjack',
    roundNumber: 0,
    overtime: 0,
    dieSides: 6,
    payout: 10,
    openerId: '',
    currentPlayerId: null,
    turnNumber: 0,
    throwing: false,
    resolving: false,
    awaitingDecision: false,
    hands: [],
    tableDie: null,
    result: null,
  };
  private forcedPlayerId: string | null = null;
  private readonly timers = new DelayedActions();
  private paused = false;

  constructor(
    private readonly getPlayers: () => EnginePlayer[],
    private settings: BlackjackSettings,
    private readonly emit: (event: BlackjackEvent) => void,
  ) {}

  get currentTurnPlayerId() {
    return this.state.currentPlayerId;
  }
  get roundNumber() {
    return this.state.roundNumber;
  }
  start() {
    this.startRound();
  }
  updateSettings(settings: BlackjackSettings) {
    this.settings = settings;
  }
  publicState(): BlackjackStatePublic {
    return structuredClone(this.state);
  }
  persistedState(): BlackjackPersistedState {
    return {
      publicState: this.publicState(),
      phase: this.phase,
      forcedPlayerId: this.forcedPlayerId,
    };
  }

  private turnError(playerId: string): BlackjackError | null {
    if (this.phase !== 'playing') return { code: 'BAD_REQUEST', message: 'round is not active' };
    if (this.currentTurnPlayerId !== playerId)
      return { code: 'NOT_YOUR_TURN', message: 'it is not your turn' };
    return null;
  }

  beginThrow(playerId: string): BlackjackError | null {
    const error = this.turnError(playerId);
    if (error) return error;
    if (this.state.throwing || this.state.resolving || this.state.awaitingDecision) {
      return {
        code: 'BAD_REQUEST',
        message: 'finish the current throw and choose stand or continue first',
      };
    }
    this.state.throwing = true;
    this.emit({ type: 'throwStarted', playerId });
    this.changed();
    return null;
  }

  commitThrow(playerId: string, die: number, restPose?: BodyPose[]): BlackjackError | null {
    const error = this.turnError(playerId);
    if (error) return error;
    if (!this.state.throwing) return { code: 'BAD_REQUEST', message: 'no throw is pending' };
    if (!isBlackjackDie(die, this.state.dieSides)) {
      return {
        code: 'BAD_REQUEST',
        message: `expected one integer in [1, ${this.state.dieSides}]`,
      };
    }
    const hand = this.state.hands.find((entry) => entry.playerId === playerId)!;
    hand.dice.push(die);
    hand.total += die;
    const pose =
      restPose && validatePolyhedralRestPose(restPose, [die], this.state.dieSides) === null
        ? structuredClone(restPose)
        : null;
    this.state.tableDie = { playerId, die, restPose: pose };
    this.state.throwing = false;
    this.state.resolving = true;
    const delay = this.settings.afterRollDelayMs;
    this.emit({ type: 'rolled', playerId, die, total: hand.total, restPose: pose });
    this.changed();
    this.timers.releaseAfter(this.timers.arm(this, true), delay, () => this.resolveRoll());
    return null;
  }

  decide(playerId: string, decision: 'stand' | 'continue'): BlackjackError | null {
    const error = this.turnError(playerId);
    if (error) return error;
    if (!this.state.awaitingDecision || this.state.resolving || this.state.throwing) {
      return { code: 'BAD_REQUEST', message: 'roll a die before choosing stand or continue' };
    }
    if (decision !== 'stand' && decision !== 'continue') {
      return { code: 'BAD_REQUEST', message: 'choose stand or continue' };
    }
    const hand = this.state.hands.find((entry) => entry.playerId === playerId)!;
    hand.stood = decision === 'stand';
    this.state.awaitingDecision = false;
    this.state.tableDie = null;
    if (this.applyOutcome()) return null;
    const other = this.state.hands.find((entry) => entry.playerId !== playerId)!;
    this.state.currentPlayerId = other.stood ? playerId : other.playerId;
    this.state.turnNumber += 1;
    const next = this.players.find((entry) => entry.id === this.currentTurnPlayerId);
    if (!next?.connected || next.seat === null) this.forceStand(this.currentTurnPlayerId!);
    else this.changed();
    return null;
  }

  private resolveRoll(): void {
    if (!this.state.resolving || this.phase !== 'playing') return;
    this.state.resolving = false;
    if (this.applyOutcome()) return;
    if (this.forcedPlayerId) {
      const playerId = this.forcedPlayerId;
      this.forcedPlayerId = null;
      this.forceStand(playerId);
      return;
    }
    // 21 is the strongest possible hand; automatically stand and let the opponent catch it.
    const hand = this.state.hands.find((entry) => entry.playerId === this.currentTurnPlayerId)!;
    this.state.awaitingDecision = true;
    if (hand.total === 21) this.decide(hand.playerId, 'stand');
    else this.changed();
  }

  private applyOutcome(): boolean {
    const outcome = blackjackOutcome(this.state.hands);
    if (outcome.type === 'play') return false;
    if (outcome.type === 'tie') {
      this.state.overtime += 1;
      this.state.dieSides = 12;
      this.state.payout = blackjackPayout(this.state.overtime);
      this.state.openerId = this.state.hands.find(
        (hand) => hand.playerId !== this.state.openerId,
      )!.playerId;
      this.resetHands();
      this.changed();
    } else {
      this.endRound(outcome.winnerId, outcome.loserId, outcome.reason);
    }
    return true;
  }

  forceStand(playerId: string): void {
    if (this.phase !== 'playing' || !this.state.hands.some((hand) => hand.playerId === playerId))
      return;
    if (this.state.resolving) {
      this.forcedPlayerId = playerId;
      this.changed();
      return;
    }
    const other = this.state.hands.find((hand) => hand.playerId !== playerId)!;
    this.endRound(other.playerId, playerId, 'forfeit');
  }

  private endRound(
    winnerId: string,
    loserId: string,
    reason: NonNullable<BlackjackStatePublic['result']>['reason'],
  ): void {
    this.timers.cancel();
    const winner = this.players.find((player) => player.id === winnerId)!;
    const loser = this.players.find((player) => player.id === loserId)!;
    const amount = Math.min(this.state.payout, loser.chips);
    loser.chips -= amount;
    winner.chips += amount;
    this.state.result = { winnerId, loserId, amount, reason };
    this.state.tableDie = null;
    this.state.currentPlayerId = null;
    this.state.throwing = false;
    this.state.resolving = false;
    this.state.awaitingDecision = false;
    this.forcedPlayerId = null;
    this.phase = 'roundEnd';
    this.emit({ type: 'roundEnded', winnerId, loserId, amount });
    this.changed();
    this.scheduleNextRound();
  }

  continueRound(): void {
    if (this.phase === 'roundEnd') {
      this.timers.cancel();
      this.startRound();
    }
  }

  private startRound(): void {
    this.players = this.getPlayers().filter((player) => player.seat !== null);
    if (
      this.players.length !== 2 ||
      this.players.some((player) => player.chips <= 0 || !player.connected)
    ) {
      this.phase = 'ended';
      this.emit({ type: 'gameEnded' });
      return;
    }
    this.state.roundNumber += 1;
    this.state.openerId = this.players[(this.state.roundNumber - 1) % 2]!.id;
    this.state.overtime = 0;
    this.state.dieSides = 6;
    this.state.payout = blackjackPayout(0);
    this.state.result = null;
    this.phase = 'playing';
    this.resetHands();
    this.changed();
  }

  private resetHands(): void {
    this.state.hands = this.players.map((player) => ({
      playerId: player.id,
      dice: [],
      total: 0,
      stood: false,
    }));
    this.state.currentPlayerId = this.state.openerId;
    this.state.turnNumber += 1;
    this.state.throwing = false;
    this.state.resolving = false;
    this.state.awaitingDecision = false;
    this.state.tableDie = null;
    this.forcedPlayerId = null;
  }

  restore(saved: BlackjackPersistedState): void {
    this.stop();
    this.players = this.getPlayers().filter((player) =>
      saved.publicState.hands.some((hand) => hand.playerId === player.id),
    );
    this.state = structuredClone(saved.publicState);
    this.state.throwing = false;
    this.phase = saved.phase;
    this.forcedPlayerId = saved.forcedPlayerId;
    if (this.state.resolving) this.resolveRoll();
  }
  pause(): void {
    this.paused = true;
    this.timers.cancel();
    this.state.throwing = false;
  }
  resume(): void {
    if (!this.paused) return;
    this.paused = false;
    if (this.state.resolving) this.resolveRoll();
    if (this.phase === 'roundEnd') this.scheduleNextRound();
    this.changed();
  }
  stop(): void {
    this.timers.cancel();
  }
  private scheduleNextRound(): void {
    if (!this.paused)
      this.timers.releaseAfter(this.timers.arm(this, true), 8_000, () => this.continueRound());
  }
  private changed(): void {
    this.emit({ type: 'stateChanged' });
  }
}
