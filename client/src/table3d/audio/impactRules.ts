import type { AudioTuning, SurfacePair } from './audioTuning';

/**
 * Collider `name` → surface pair, from a die's point of view. Names are set
 * as props on the colliders in DieBody / TableColliders / KoozieBody; an
 * unknown or unnamed collider (including the containment ceiling) is silent.
 */
export function classifyPair(otherColliderName: string | undefined): SurfacePair | null {
  switch (otherColliderName) {
    case 'die':
      return 'die-die';
    case 'felt':
      return 'die-felt';
    case 'rail':
      return 'die-rail';
    case 'wall':
      return 'die-wall';
    case 'cup-bottom':
    case 'cup-wall':
      return 'die-cup';
    case 'cup-lid':
      return 'die-lid';
    default:
      return null;
  }
}

export interface ImpactDecision {
  play: boolean;
  /** 0–1 volume scale, sqrt-curved so soft touches stay audible. */
  intensity: number;
}

const SILENT: ImpactDecision = { play: false, intensity: 0 };

/**
 * Turns the raw contact-force stream (one event per touching pair per
 * physics step) into discrete plays. Pure and clock-agnostic: callers pass
 * `nowMs`. Rules, in order:
 *
 * 1. Forces below the pair's `minForce` never play (rest contacts).
 * 2. Rising edge: a pair plays when its force crosses the threshold, then
 *    stays silent while contact persists; a gap of `risingEdgeStaleMs`
 *    without events re-arms it (contact-force events simply stop when the
 *    bodies separate).
 * 3. Per-pair cooldown so a fast bounce can't double-fire.
 * 4. Global rate cap: at most `maxStarts` plays per `startWindowMs`.
 */
export function createImpactGate(tuning: AudioTuning['impact']) {
  const pairs = new Map<string, { lastEventMs: number; wasAbove: boolean; lastPlayMs: number }>();
  const startTimes: number[] = [];

  return {
    evaluate(pairKey: string, pair: SurfacePair, forceMag: number, nowMs: number): ImpactDecision {
      const minForce = tuning.minForce[pair];
      let state = pairs.get(pairKey);
      if (state === undefined) {
        state = { lastEventMs: -Infinity, wasAbove: false, lastPlayMs: -Infinity };
        pairs.set(pairKey, state);
      }
      if (nowMs - state.lastEventMs > tuning.risingEdgeStaleMs) state.wasAbove = false;
      state.lastEventMs = nowMs;

      const above = forceMag >= minForce;
      const rising = above && !state.wasAbove;
      state.wasAbove = above;
      if (!rising) return SILENT;
      if (nowMs - state.lastPlayMs < tuning.pairCooldownMs) return SILENT;

      while (startTimes.length > 0 && nowMs - (startTimes[0] as number) > tuning.startWindowMs) {
        startTimes.shift();
      }
      if (startTimes.length >= tuning.maxStarts) return SILENT;

      state.lastPlayMs = nowMs;
      startTimes.push(nowMs);
      const refForce = tuning.refForce[pair];
      const span = Math.max(refForce - minForce, 1e-6);
      const normalized = Math.min(Math.max((forceMag - minForce) / span, 0), 1);
      return { play: true, intensity: Math.sqrt(normalized) };
    },

    reset(): void {
      pairs.clear();
      startTimes.length = 0;
    },
  };
}

export type ImpactGate = ReturnType<typeof createImpactGate>;
