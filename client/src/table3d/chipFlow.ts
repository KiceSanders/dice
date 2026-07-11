export const CHIP_ANTE_TRAVEL_MS = 650;
export const CHIP_ANTE_STAGGER_MS = 320;
export const CHIP_AWARD_TRAVEL_MS = 900;
export const CHIP_TRANSFER_TRAVEL_MS = 700;
export const CHIP_EVENT_REPLAY_MS = 1_500;

export interface Point2 {
  x: number;
  y: number;
}

export function chipAnimationsEnabled(prefersReducedMotion: boolean): boolean {
  return !prefersReducedMotion;
}

export function clampUnit(value: number): number {
  return Math.min(1, Math.max(0, value));
}

export function animationProgress(now: number, startedAt: number, duration: number, delay = 0) {
  return clampUnit((now - startedAt - delay) / duration);
}

export function staggerDelay(index: number, total: number): number {
  if (total <= 1) return 0;
  return (Math.max(0, index) / (total - 1)) * CHIP_ANTE_STAGGER_MS;
}

export function easeInOutCubic(progress: number): number {
  const t = clampUnit(progress);
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
}

export function lerpPoint(from: Point2, to: Point2, progress: number): Point2 {
  const t = easeInOutCubic(progress);
  return {
    x: from.x + (to.x - from.x) * t,
    y: from.y + (to.y - from.y) * t,
  };
}

/** Slight upward arc so an ante reads as a tossed chip rather than a flat wipe. */
export function chipFlightPoint(from: Point2, to: Point2, progress: number): Point2 {
  const point = lerpPoint(from, to, progress);
  const arc =
    Math.sin(Math.PI * clampUnit(progress)) *
    Math.min(42, Math.hypot(to.x - from.x, to.y - from.y) * 0.12);
  return { x: point.x, y: point.y - arc };
}
