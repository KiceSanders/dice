export const BETALOT_ROUND_END_DELAY_MS = 8_000;

/** Owns Bet-a-lot's one reveal timer and round-end fallback timer. */
export class BetALotTiming {
  private resolutionTimer: NodeJS.Timeout | null = null;
  private roundTimer: NodeJS.Timeout | null = null;
  private paused = false;

  scheduleResolution(delayMs: number, resolve: () => void): void {
    if (delayMs <= 0) {
      resolve();
      return;
    }
    this.resolutionTimer = setTimeout(() => {
      this.resolutionTimer = null;
      resolve();
    }, delayMs);
    this.resolutionTimer.unref?.();
  }

  cancelRoundFallback(): void {
    if (this.roundTimer) clearTimeout(this.roundTimer);
    this.roundTimer = null;
  }

  scheduleRoundFallback(startRound: () => void): void {
    if (this.paused) return;
    this.cancelRoundFallback();
    this.roundTimer = setTimeout(() => {
      this.roundTimer = null;
      startRound();
    }, BETALOT_ROUND_END_DELAY_MS);
    this.roundTimer.unref?.();
  }

  pause(): void {
    this.paused = true;
    if (this.resolutionTimer) clearTimeout(this.resolutionTimer);
    this.resolutionTimer = null;
    this.cancelRoundFallback();
  }

  resume(): boolean {
    if (!this.paused) return false;
    this.paused = false;
    return true;
  }

  stop(): void {
    if (this.resolutionTimer) clearTimeout(this.resolutionTimer);
    this.resolutionTimer = null;
    this.cancelRoundFallback();
  }
}
