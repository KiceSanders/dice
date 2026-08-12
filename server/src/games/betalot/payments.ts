import type { BetALotFireState, BetALotSettings, Die, PlayerId } from '@dice/shared';
import {
  allSamePayoutForDiceCount,
  firePaymentAmount,
  isAllSame,
  isFullHouse,
  isStraight,
  onFireAfterWin,
  overTwentyFivePayout,
  straightPayoutForDiceCount,
} from '@dice/shared';
import type { EnginePlayer } from '../../engine.js';

export type BetALotPaymentReason =
  | 'call'
  | 'openingOne'
  | 'loss'
  | 'straight'
  | 'allSame'
  | 'allSameExtra'
  | 'fullHouse'
  | 'sevenOpponent'
  | 'sevenPot'
  | 'overTwentyFive'
  | 'sevensPotWon';

export interface BetALotPaidEvent {
  type: 'paid';
  fromPlayerId: PlayerId;
  toPlayerId: PlayerId | null;
  amount: number;
  reason: BetALotPaymentReason;
  sevensPot: number;
}

/**
 * Bet-a-lot's zero-sum chip ledger and ordered per-roll side effects.
 * Ladder/turn decisions stay in the engine; all balance mutation stays here.
 */
export class BetALotPayments {
  sevensPot = 0;
  private fire = new Map<PlayerId, BetALotFireState>();

  constructor(
    private readonly players: () => EnginePlayer[],
    private readonly other: (playerId: PlayerId) => PlayerId,
    private readonly emit: (event: BetALotPaidEvent) => void,
  ) {}

  restore(sevensPot: number, fire: BetALotFireState[]): void {
    this.sevensPot = sevensPot;
    this.fire = new Map(fire.map((entry) => [entry.playerId, { ...entry }]));
  }

  fireState(): BetALotFireState[] {
    return this.players().map(
      (player) => this.fire.get(player.id) ?? { playerId: player.id, streak: 0, onFire: false },
    );
  }

  updateFire(winnerId: PlayerId, loserId: PlayerId): BetALotFireState[] {
    const winner = this.fire.get(winnerId) ?? { playerId: winnerId, streak: 0, onFire: false };
    winner.streak += 1;
    winner.onFire = onFireAfterWin(winner.streak);
    this.fire.set(winnerId, winner);
    this.fire.set(loserId, { playerId: loserId, streak: 0, onFire: false });
    return this.fireState();
  }

  bankruptPlayer(): EnginePlayer | undefined {
    return this.players().find((player) => player.chips <= 0);
  }

  applyPerRollEffects({
    playerId,
    dice,
    score,
    rung,
    pendingCall,
    settings,
  }: {
    playerId: PlayerId;
    dice: Die[];
    score: number;
    rung: number;
    pendingCall: Die | null;
    settings: BetALotSettings;
  }): void {
    if (rung === 1 && pendingCall !== null && dice[0] === pendingCall) {
      this.payOpponent(playerId, settings.callPayout, 'call');
    }
    if (rung === 1 && dice[0] === 1) {
      this.pay(playerId, this.other(playerId), settings.openingOnePenalty, 'openingOne');
    }
    if (isStraight(dice)) {
      this.payOpponent(playerId, straightPayoutForDiceCount(settings, dice.length), 'straight');
    }
    if (isAllSame(dice)) {
      this.payOpponent(playerId, allSamePayoutForDiceCount(settings, dice.length), 'allSame');
    }
    if (isFullHouse(dice)) {
      this.payOpponent(playerId, settings.fullHousePayout, 'fullHouse');
    }
    if (score === 7) {
      this.pay(playerId, this.other(playerId), settings.sevenOpponentPayout, 'sevenOpponent');
      this.pay(playerId, null, settings.sevenPotContribution, 'sevenPot');
    }
    if (score === 21 && this.sevensPot > 0) {
      const amount = this.sevensPot;
      this.sevensPot = 0;
      const player = this.player(playerId);
      if (player) player.chips += amount;
      this.emit({
        type: 'paid',
        fromPlayerId: 'pot',
        toPlayerId: playerId,
        amount,
        reason: 'sevensPotWon',
        sevensPot: 0,
      });
    }
    this.payOpponent(playerId, overTwentyFivePayout(settings, score), 'overTwentyFive');
  }

  payOpponent(winnerId: PlayerId, amount: number, reason: BetALotPaymentReason): number {
    return this.pay(this.other(winnerId), winnerId, amount, reason);
  }

  pay(
    fromPlayerId: PlayerId,
    toPlayerId: PlayerId | null,
    amount: number,
    reason: BetALotPaymentReason,
  ): number {
    const payer = this.player(fromPlayerId);
    if (!payer || amount <= 0) return 0;
    const firePlayer = [...this.fire.values()].find((state) => state.onFire)?.playerId;
    const multiplied = firePaymentAmount(amount, fromPlayerId, firePlayer ?? null);
    const paid = Math.min(payer.chips, multiplied);
    payer.chips -= paid;
    if (toPlayerId) this.player(toPlayerId)!.chips += paid;
    else this.sevensPot += paid;
    this.emit({
      type: 'paid',
      fromPlayerId,
      toPlayerId,
      amount: paid,
      reason,
      sevensPot: this.sevensPot,
    });
    return paid;
  }

  private player(playerId: PlayerId): EnginePlayer | undefined {
    return this.players().find((player) => player.id === playerId);
  }
}
