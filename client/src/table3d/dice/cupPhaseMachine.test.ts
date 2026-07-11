import { describe, expect, it } from 'vitest';
import {
  CUP_PHASE_EDGES,
  type CupPhase,
  cupStreamingVisible,
  initialCupPhase,
  isAllowedCupTransition,
  poseSampleIntervalMs,
} from './cupPhaseMachine';

describe('cupPhaseMachine', () => {
  it('starts idle for an active roller, hidden otherwise', () => {
    expect(initialCupPhase(true, true)).toBe('idle');
    expect(initialCupPhase(true, false)).toBe('hidden');
    expect(initialCupPhase(false, true)).toBe('hidden');
  });

  it('allows the documented happy-path transitions', () => {
    const path: CupPhase[] = ['idle', 'held', 'pouring', 'settling', 'selecting', 'idle'];
    for (let i = 0; i < path.length - 1; i++) {
      expect(isAllowedCupTransition(path[i]!, path[i + 1]!)).toBe(true);
    }
  });

  it('rejects inventing edges (e.g. idle → pouring)', () => {
    expect(isAllowedCupTransition('idle', 'pouring')).toBe(false);
    expect(isAllowedCupTransition('selecting', 'pouring')).toBe(false);
  });

  it('lists every documented edge as allowed', () => {
    for (const [from, to] of CUP_PHASE_EDGES) {
      expect(isAllowedCupTransition(from, to)).toBe(true);
    }
  });

  it('streams cup visibility only while held or pouring', () => {
    expect(cupStreamingVisible('held')).toBe(true);
    expect(cupStreamingVisible('pouring')).toBe(true);
    expect(cupStreamingVisible('settling')).toBe(false);
    expect(cupStreamingVisible('selecting')).toBe(false);
  });

  it('uses the slow sample rate while selecting', () => {
    expect(poseSampleIntervalMs('selecting', 50, 250)).toBe(250);
    expect(poseSampleIntervalMs('held', 50, 250)).toBe(50);
  });
});
