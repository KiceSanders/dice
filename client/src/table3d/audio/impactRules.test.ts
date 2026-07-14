import { describe, expect, it } from 'vitest';
import { AUDIO_TUNING } from './audioTuning';
import { classifyPair, createImpactGate } from './impactRules';

const tuning = AUDIO_TUNING.impact;
const MIN = tuning.minForce['die-felt'];
const REF = tuning.refForce['die-felt'];

describe('classifyPair', () => {
  it('maps every tagged collider name to its surface pair', () => {
    expect(classifyPair('die')).toBe('die-die');
    expect(classifyPair('felt')).toBe('die-felt');
    expect(classifyPair('rail')).toBe('die-rail');
    expect(classifyPair('wall')).toBe('die-wall');
    expect(classifyPair('cup-bottom')).toBe('die-cup');
    expect(classifyPair('cup-wall')).toBe('die-cup');
    expect(classifyPair('cup-lid')).toBe('die-lid');
  });

  it('is silent for unknown, unnamed, and ceiling colliders', () => {
    expect(classifyPair('ceiling')).toBeNull();
    expect(classifyPair('')).toBeNull();
    expect(classifyPair(undefined)).toBeNull();
  });
});

describe('createImpactGate', () => {
  it('never plays below the pair threshold', () => {
    const gate = createImpactGate(tuning);
    expect(gate.evaluate('a:b', 'die-felt', MIN * 0.9, 0).play).toBe(false);
    expect(gate.evaluate('a:b', 'die-felt', MIN * 0.9, 100).play).toBe(false);
  });

  it('plays once on the rising edge, then stays silent through sustained contact', () => {
    const gate = createImpactGate(tuning);
    expect(gate.evaluate('a:b', 'die-felt', REF, 0).play).toBe(true);
    // Contact-force events keep arriving every physics step while touching.
    for (let t = 16; t <= 320; t += 16) {
      expect(gate.evaluate('a:b', 'die-felt', REF, t).play).toBe(false);
    }
  });

  it('re-arms after a silent gap longer than risingEdgeStaleMs', () => {
    const gate = createImpactGate(tuning);
    expect(gate.evaluate('a:b', 'die-felt', REF, 0).play).toBe(true);
    const later = tuning.risingEdgeStaleMs + 1;
    expect(gate.evaluate('a:b', 'die-felt', REF, later).play).toBe(true);
  });

  it('re-arms when the force dips below threshold while events continue', () => {
    const gate = createImpactGate(tuning);
    expect(gate.evaluate('a:b', 'die-felt', REF, 0).play).toBe(true);
    expect(gate.evaluate('a:b', 'die-felt', MIN * 0.5, 50).play).toBe(false);
    expect(gate.evaluate('a:b', 'die-felt', REF, tuning.pairCooldownMs + 60).play).toBe(true);
  });

  it('enforces the per-pair cooldown independently of the rising edge', () => {
    const gate = createImpactGate(tuning);
    expect(gate.evaluate('a:b', 'die-felt', REF, 0).play).toBe(true);
    // Dip re-arms the edge, but the second play lands inside the cooldown.
    gate.evaluate('a:b', 'die-felt', MIN * 0.5, 20);
    expect(gate.evaluate('a:b', 'die-felt', REF, 40).play).toBe(false);
  });

  it('caps global starts per window but keeps distinct pairs otherwise independent', () => {
    const gate = createImpactGate(tuning);
    for (let i = 0; i < tuning.maxStarts; i++) {
      expect(gate.evaluate(`pair-${i}`, 'die-felt', REF, i).play).toBe(true);
    }
    expect(gate.evaluate('overflow', 'die-felt', REF, tuning.maxStarts).play).toBe(false);
    const afterWindow = tuning.startWindowMs + tuning.maxStarts + 1;
    expect(gate.evaluate('late-fresh-pair', 'die-felt', REF, afterWindow).play).toBe(true);
  });

  it('intensity is 0 at threshold, 1 at refForce, monotonic and clamped', () => {
    const gate = createImpactGate(tuning);
    const atMin = gate.evaluate('p1', 'die-felt', MIN, 0);
    const mid = gate.evaluate('p2', 'die-felt', (MIN + REF) / 2, 200);
    const atRef = gate.evaluate('p3', 'die-felt', REF, 400);
    const beyond = gate.evaluate('p4', 'die-felt', REF * 10, 600);
    expect(atMin.intensity).toBe(0);
    expect(mid.intensity).toBeGreaterThan(0);
    expect(mid.intensity).toBeLessThan(1);
    expect(atRef.intensity).toBe(1);
    expect(beyond.intensity).toBe(1);
  });

  it('reset clears pair state and the rate window', () => {
    const gate = createImpactGate(tuning);
    expect(gate.evaluate('a:b', 'die-felt', REF, 0).play).toBe(true);
    gate.reset();
    expect(gate.evaluate('a:b', 'die-felt', REF, 1).play).toBe(true);
  });
});
