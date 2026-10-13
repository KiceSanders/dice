import { randomInt, randomUUID } from 'node:crypto';
import {
  assertNever,
  type BetALotSlotsState,
  type ClientMessage,
  canSpinSlots,
  createSlotRound,
  type Die,
  redeemSlotTickets,
  SLOT_DIFFICULTIES,
  SLOT_REVEAL_MS,
  SLOT_TARGETS,
  slotRoundReducer,
} from '@dice/shared';
import type { BetALotError } from './engine.js';

export type SlotCommand = Extract<ClientMessage, { type: 'betalot:slotsAction' }>;
export const SLOT_DECISION_MS = 60_000;
export const SLOT_RESULT_MS = 8_000;

interface Context {
  terms: (playerId: string) => { fireMultiplier: number; payoutLimit: number };
  eligible: (playerId: string) => boolean;
  pay: (playerId: string, amount: number) => void;
  changed: () => void;
  finished: () => void;
}

/** Server-owned bonus lifecycle; each bonus redeems two tickets from one player. */
export class BetALotSlots {
  private state: BetALotSlotsState = { tickets: [], active: null };
  private timer: NodeJS.Timeout | null = null;
  private paused = false;

  constructor(
    private readonly ctx: Context,
    private readonly drawIndex = randomInt,
  ) {}

  award(playerId: string): void {
    this.state.tickets.push(playerId);
  }

  snapshot(): BetALotSlotsState {
    return structuredClone(this.state);
  }

  restore(state?: BetALotSlotsState): void {
    this.stop();
    this.state = state ? structuredClone(state) : { tickets: [], active: null };
  }

  get active(): boolean {
    return this.state.active !== null;
  }

  startNext(): boolean {
    if (this.active) return true;
    this.state.tickets = this.state.tickets.filter((id) => this.ctx.eligible(id));
    const redemption = redeemSlotTickets(this.state.tickets);
    if (!redemption) return false;
    const { playerId } = redemption;
    this.state.tickets = redemption.tickets;
    const terms = this.ctx.terms(playerId);
    const targets = SLOT_DIFFICULTIES.map((difficulty) => {
      const pool = SLOT_TARGETS[difficulty];
      const target = pool[this.drawIndex(pool.length)]!;
      return {
        ...target,
        payout: Math.min(terms.payoutLimit, target.payout * terms.fireMultiplier),
      };
    });
    this.state.active = {
      id: randomUUID(),
      playerId,
      revision: 0,
      round: createSlotRound(targets),
      ...terms,
      settlesAt: null,
      expiresAt: Date.now() + SLOT_DECISION_MS,
    };
    this.ctx.changed();
    this.schedule();
    return true;
  }

  command(playerId: string, command: SlotCommand): BetALotError | null {
    const bonus = this.state.active;
    if (!bonus || bonus.id !== command.bonusId)
      return this.bad('this slot bonus is no longer active');
    if (bonus.playerId !== playerId || !this.ctx.eligible(playerId)) {
      return { code: 'NOT_YOUR_TURN', message: 'only the ticket owner can play this bonus' };
    }
    if (bonus.revision !== command.revision)
      return this.bad('slot state changed; use the latest hand');
    switch (command.action) {
      case 'spin': {
        if (!canSpinSlots(bonus.round)) return this.bad('a spin is unavailable');
        const dice = Array.from({ length: 5 }, () => (this.drawIndex(6) + 1) as Die);
        bonus.round = slotRoundReducer(bonus.round, { type: 'spin', dice });
        bonus.revision += 1;
        bonus.settlesAt = Date.now() + SLOT_REVEAL_MS;
        bonus.expiresAt = bonus.settlesAt + SLOT_DECISION_MS;
        this.ctx.changed();
        this.schedule();
        return null;
      }
      case 'lock':
        if (bonus.round.phase !== 'choosing') return this.bad('wait for the reels to stop');
        if (!Number.isInteger(command.index) || command.index < 0 || command.index >= 5)
          return this.bad('invalid die index');
        if (bonus.round.locked[command.index] !== command.locked) {
          bonus.round = slotRoundReducer(bonus.round, {
            type: 'toggle-lock',
            index: command.index,
          });
          bonus.revision += 1;
          this.ctx.changed();
        }
        return null;
      case 'collect':
        if (bonus.round.phase !== 'choosing') return this.bad('there is no hand to collect');
        bonus.round = slotRoundReducer(bonus.round, { type: 'collect' });
        this.complete();
        return null;
      case 'continue':
        if (bonus.round.phase !== 'complete') return this.bad('finish the slot bonus first');
        this.finish();
        return null;
      default:
        return assertNever(command, 'slot command');
    }
  }

  private settle(): void {
    const bonus = this.state.active;
    if (bonus?.round.phase !== 'spinning') return;
    bonus.round = slotRoundReducer(bonus.round, { type: 'settle' });
    bonus.settlesAt = null;
    if (bonus.round.phase === 'complete') this.complete();
    else {
      bonus.revision += 1;
      bonus.expiresAt = Date.now() + SLOT_DECISION_MS;
      this.ctx.changed();
      this.schedule();
    }
  }

  private complete(): void {
    const bonus = this.state.active!;
    // Mark complete before paying: any snapshot emitted by the ledger is already settled.
    bonus.revision += 1;
    bonus.expiresAt = Date.now() + SLOT_RESULT_MS;
    bonus.settlesAt = null;
    if (!this.ctx.eligible(bonus.playerId)) bonus.round = { ...bonus.round, payout: 0 };
    if (bonus.round.payout > 0) this.ctx.pay(bonus.playerId, bonus.round.payout);
    this.ctx.changed();
    this.schedule();
  }

  private finish(): void {
    this.stop();
    this.state.active = null;
    this.ctx.changed();
    this.ctx.finished();
  }

  private schedule(): void {
    this.stop();
    const bonus = this.state.active;
    if (!bonus || this.paused) return;
    const deadline = bonus.settlesAt ?? bonus.expiresAt;
    this.timer = setTimeout(
      () => {
        this.timer = null;
        if (bonus !== this.state.active) return;
        if (bonus.round.phase === 'spinning') this.settle();
        else if (bonus.round.phase === 'complete') this.finish();
        else {
          bonus.round =
            bonus.round.phase === 'ready'
              ? { ...bonus.round, phase: 'complete', payout: 0 }
              : slotRoundReducer(bonus.round, { type: 'collect' });
          this.complete();
        }
      },
      Math.max(0, deadline - Date.now()),
    );
    this.timer.unref?.();
  }

  pause(): void {
    this.paused = true;
    this.stop();
  }

  resume(): void {
    this.paused = false;
    this.schedule();
  }

  stop(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  private bad(message: string): BetALotError {
    return { code: 'BAD_REQUEST', message };
  }
}
