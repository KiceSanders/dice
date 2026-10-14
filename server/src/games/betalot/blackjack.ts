import {
  BETALOT_BLACKJACK_INTERVAL,
  type BetALotSettings,
  type BlackjackStatePublic,
  isBlackjackBonusDue,
} from '@dice/shared';
import type { EnginePlayer } from '../../engine.js';
import {
  BlackjackEngine,
  type BlackjackEvent,
  type BlackjackPersistedState,
} from '../blackjack/engine.js';

export interface BetALotBlackjackSaved {
  lastBonusRound: number;
  active: BlackjackPersistedState | null;
}

interface Context {
  players: () => EnginePlayer[];
  settings: () => BetALotSettings;
  firePlayer: () => string | null;
  pay: (winnerId: string, loserId: string, amount: number) => number;
  emit: (event: BlackjackEvent) => void;
  finished: () => void;
}

/** One shared Blackjack hand (including all overtimes), then back to the ladder. */
export class BetALotBlackjack {
  engine: BlackjackEngine | null = null;
  private lastBonusRound = 0;

  constructor(private readonly ctx: Context) {}

  startNext(completedRound: number): boolean {
    if (!isBlackjackBonusDue(completedRound, this.lastBonusRound)) return false;
    // Set before emitting the first snapshot: recovery must never replay this bonus.
    this.lastBonusRound = completedRound;
    this.engine = this.create({ afterRound: completedRound, firePlayerId: this.ctx.firePlayer() });
    this.engine.start();
    return true;
  }

  private create(bonus: NonNullable<BlackjackStatePublic['bonus']>): BlackjackEngine {
    return new BlackjackEngine(
      this.ctx.players,
      { ...this.ctx.settings(), kind: 'blackjack' },
      this.ctx.emit,
      {
        bonus,
        roundNumberOffset: bonus.afterRound / BETALOT_BLACKJACK_INTERVAL - 1,
        pay: this.ctx.pay,
        finished: () => {
          this.engine?.stop();
          this.engine = null;
          this.ctx.finished();
        },
      },
    );
  }

  saved(): BetALotBlackjackSaved {
    return { lastBonusRound: this.lastBonusRound, active: this.engine?.persistedState() ?? null };
  }

  restore(saved: BetALotBlackjackSaved | undefined): void {
    this.engine?.stop();
    this.engine = null;
    this.lastBonusRound = saved?.lastBonusRound ?? 0;
    if (saved?.active) {
      this.engine = this.create(saved.active.publicState.bonus!);
      this.engine.restore(saved.active);
    }
  }
}
