import { describe, expect, it } from 'vitest';
import { nudgeReleaseVelocity, releaseNeedsNudge } from './dicePointer';
import { DEFAULT_DICE_PHYSICS_TUNING } from './tuning';

const tuning = DEFAULT_DICE_PHYSICS_TUNING;

describe('nudgeReleaseVelocity', () => {
  it('leaves fast releases unchanged', () => {
    const velocity = { x: 1.2, y: 0.1, z: -0.4 };
    expect(releaseNeedsNudge(velocity, tuning)).toBe(false);
    expect(nudgeReleaseVelocity(velocity, tuning, () => 0.25)).toEqual(velocity);
  });

  it('adds a horizontal nudge when speed is below the threshold', () => {
    expect(releaseNeedsNudge({ x: 0, y: 0, z: 0 }, tuning)).toBe(true);
    const nudged = nudgeReleaseVelocity({ x: 0, y: 0, z: 0 }, tuning, () => 0);
    const speed = Math.hypot(nudged.x, nudged.y, nudged.z);
    expect(speed).toBeGreaterThanOrEqual(tuning.release.nudgeMinSpeed);
    expect(nudged.x).toBeCloseTo(tuning.release.nudgeSpeed, 6);
    expect(nudged.y).toBeCloseTo(tuning.release.nudgeSpeed * 0.35, 6);
    expect(nudged.z).toBeCloseTo(0, 6);
  });

  it('varies direction across rng draws', () => {
    const a = nudgeReleaseVelocity({ x: 0, y: 0, z: 0 }, tuning, () => 0.1);
    const b = nudgeReleaseVelocity({ x: 0, y: 0, z: 0 }, tuning, () => 0.6);
    expect(a).not.toEqual(b);
  });
});
