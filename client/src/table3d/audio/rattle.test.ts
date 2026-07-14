import { describe, expect, it } from 'vitest';
import { AUDIO_TUNING } from './audioTuning';
import { createRattleLevel, rattleFeedAmount } from './rattle';

describe('createRattleLevel', () => {
  it('starts at zero and accumulates fed energy', () => {
    const rattle = createRattleLevel(AUDIO_TUNING.rattle);
    expect(rattle.level(0)).toBe(0);
    rattle.feed(0.3, 0);
    rattle.feed(0.3, 0);
    expect(rattle.level(0)).toBeCloseTo(0.6);
  });

  it('clamps at 1 no matter how much is fed', () => {
    const rattle = createRattleLevel(AUDIO_TUNING.rattle);
    rattle.feed(5, 0);
    expect(rattle.level(0)).toBe(1);
  });

  it('decays exponentially over time', () => {
    const rattle = createRattleLevel(AUDIO_TUNING.rattle);
    rattle.feed(1, 0);
    const after1s = rattle.level(1_000);
    expect(after1s).toBeCloseTo(Math.exp(-AUDIO_TUNING.rattle.decayPerSec), 5);
    expect(rattle.level(10_000)).toBeLessThan(0.001);
  });

  it('raiseTo lifts the level but never lowers it', () => {
    const rattle = createRattleLevel(AUDIO_TUNING.rattle);
    rattle.raiseTo(0.5, 0);
    expect(rattle.level(0)).toBe(0.5);
    rattle.raiseTo(0.2, 0);
    expect(rattle.level(0)).toBe(0.5);
    rattle.raiseTo(2, 0);
    expect(rattle.level(0)).toBe(1);
  });

  it('rest-weight contact forces feed nothing — a motionless held cup is silent', () => {
    const tuning = AUDIO_TUNING.rattle;
    // A die resting on the cup bottom reports ~its weight every physics step.
    const restingForce = 0.04;
    expect(restingForce).toBeLessThan(tuning.feedMinForce);
    expect(rattleFeedAmount(restingForce, tuning)).toBe(0);
    expect(rattleFeedAmount(tuning.feedMinForce, tuning)).toBe(0);
    const shake = rattleFeedAmount(tuning.feedMinForce + 0.5, tuning);
    expect(shake).toBeCloseTo(0.5 * tuning.forceScale, 5);
  });

  it('reset returns to silence', () => {
    const rattle = createRattleLevel(AUDIO_TUNING.rattle);
    rattle.feed(1, 0);
    rattle.reset();
    expect(rattle.level(500)).toBe(0);
  });
});
