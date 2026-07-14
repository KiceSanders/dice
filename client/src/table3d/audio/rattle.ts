import { AUDIO_TUNING, type AudioTuning } from './audioTuning';

/**
 * Leaky integrator behind the cup-rattle loop's volume: impacts feed energy
 * in, the level decays exponentially, and the engine ramps the loop gain to
 * follow it. Shared vocabulary for both sides of the three-renderer rule —
 * the roller feeds contact forces (`feed`), spectators feed pose-derived
 * shake (`raiseTo`). Pure and clock-agnostic: callers pass `nowMs`.
 */
export function createRattleLevel(tuning: AudioTuning['rattle']) {
  let level = 0;
  let lastMs: number | null = null;

  const decayTo = (nowMs: number): void => {
    if (lastMs !== null && nowMs > lastMs) {
      level *= Math.exp((-tuning.decayPerSec * (nowMs - lastMs)) / 1000);
    }
    lastMs = nowMs;
  };

  return {
    /** Add impact energy (already scaled by the caller), clamped to 1. */
    feed(amount: number, nowMs: number): void {
      decayTo(nowMs);
      level = Math.min(level + amount, 1);
    },

    /** Lift the level to at least `target` (spectator shake tracking). */
    raiseTo(target: number, nowMs: number): void {
      decayTo(nowMs);
      level = Math.min(Math.max(level, target), 1);
    },

    level(nowMs: number): number {
      decayTo(nowMs);
      return level;
    },

    reset(): void {
      level = 0;
      lastMs = null;
    },
  };
}

export type RattleLevel = ReturnType<typeof createRattleLevel>;

/**
 * Contact force → feed amount. Zero at or below `feedMinForce`: dice resting
 * on the cup bottom press their weight into it every physics step, and a
 * motionless held cup must be silent — only force above the rest floor is
 * shake energy.
 */
export function rattleFeedAmount(forceMag: number, tuning: AudioTuning['rattle']): number {
  return Math.max(0, forceMag - tuning.feedMinForce) * tuning.forceScale;
}

/** The one table's rattle level — fed by roller contacts and spectator poses. */
export const tableRattle: RattleLevel = createRattleLevel(AUDIO_TUNING.rattle);
