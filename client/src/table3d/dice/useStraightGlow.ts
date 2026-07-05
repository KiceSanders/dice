import type { Die } from '@dice/shared';
import { useFrame } from '@react-three/fiber';
import { useCallback, useMemo, useRef } from 'react';
import { DICE_COUNT } from './constants';
import {
  type GlowHandle,
  glowDurationMs,
  glowEnvelope,
  STRAIGHT_GLOW,
  straightGlowOrder,
} from './straightGlow';

interface GlowTimeline {
  /** Die indices in ascending face order. */
  order: number[];
  startedAt: number;
  reducedMotion: boolean;
}

/**
 * Drives the straight celebration: `start(dice)` is a no-op unless the dice
 * form a straight, then the per-die handles pulse in ascending face order
 * (simultaneously under prefers-reduced-motion) and self-clear when done.
 * Handles are stable across renders — pass `glow[i]` to each die's PipDie.
 * Must be called inside the r3f Canvas (uses useFrame).
 */
export function useStraightGlow(): {
  glow: GlowHandle[];
  start: (dice: Die[]) => void;
  clear: () => void;
} {
  const glow = useMemo<GlowHandle[]>(
    () => Array.from({ length: DICE_COUNT }, () => ({ current: 0 })),
    [],
  );
  const timelineRef = useRef<GlowTimeline | null>(null);

  const clear = useCallback(() => {
    timelineRef.current = null;
    for (const handle of glow) handle.current = 0;
  }, [glow]);

  const start = useCallback((dice: Die[]) => {
    const order = straightGlowOrder(dice);
    if (!order) return;
    const reducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    timelineRef.current = { order, startedAt: performance.now(), reducedMotion };
  }, []);

  useFrame(() => {
    const timeline = timelineRef.current;
    if (!timeline) return;
    const elapsed = performance.now() - timeline.startedAt;
    if (elapsed >= glowDurationMs(timeline.order.length, timeline.reducedMotion)) {
      clear();
      return;
    }
    const stepMs = timeline.reducedMotion ? 0 : STRAIGHT_GLOW.stepMs;
    const holdMs = timeline.reducedMotion ? STRAIGHT_GLOW.reducedHoldMs : STRAIGHT_GLOW.holdMs;
    timeline.order.forEach((dieIndex, k) => {
      const handle = glow[dieIndex];
      if (handle) handle.current = glowEnvelope(elapsed - k * stepMs, holdMs);
    });
  });

  return { glow, start, clear };
}
