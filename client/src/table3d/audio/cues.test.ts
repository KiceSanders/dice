import { describe, expect, it } from 'vitest';
import { FELT_HALF_EXTENT } from '../layout';
import { AUDIO_TUNING, type SurfacePair } from './audioTuning';
import { type AudioCue, panForWorldX, resolveCue } from './cues';
import { SOUND_MANIFEST, type SoundId } from './sampleManifest';

const ALL_PAIRS: SurfacePair[] = [
  'die-die',
  'die-felt',
  'die-rail',
  'die-wall',
  'die-cup',
  'die-lid',
];
const ALL_SOUNDS = Object.keys(SOUND_MANIFEST) as SoundId[];

describe('resolveCue', () => {
  it('every surface pair resolves to a manifest sound with at least one file', () => {
    for (const pair of ALL_PAIRS) {
      const spec = resolveCue({ kind: 'impact', pair, intensity: 1, worldX: 0 }, () => 0);
      const sample = SOUND_MANIFEST[spec.soundId];
      expect(sample.files.length).toBeGreaterThan(0);
      expect(spec.fileIndex).toBeGreaterThanOrEqual(0);
      expect(spec.fileIndex).toBeLessThan(sample.files.length);
    }
  });

  it('every manifest sound resolves as a one-shot', () => {
    for (const id of ALL_SOUNDS) {
      const spec = resolveCue({ kind: 'one-shot', id }, () => 0);
      expect(spec.soundId).toBe(id);
      expect(spec.gain).toBeGreaterThan(0);
      expect(spec.gain).toBeLessThanOrEqual(1);
    }
  });

  it('impact gain scales with intensity and never falls to zero or above 1', () => {
    const cue = (intensity: number): AudioCue => ({
      kind: 'impact',
      pair: 'die-felt',
      intensity,
      worldX: 0,
    });
    const soft = resolveCue(cue(0), () => 0).gain;
    const hard = resolveCue(cue(1), () => 0).gain;
    const over = resolveCue(cue(5), () => 0).gain;
    expect(soft).toBeGreaterThan(0);
    expect(hard).toBeGreaterThan(soft);
    expect(hard).toBeLessThanOrEqual(1);
    expect(over).toBe(hard);
  });

  it('rng picks the file variation and pitch jitter deterministically', () => {
    const low = resolveCue({ kind: 'impact', pair: 'die-die', intensity: 1, worldX: 0 }, () => 0);
    expect(low.fileIndex).toBe(0);
    expect(low.playbackRate).toBeCloseTo(1 - AUDIO_TUNING.impact.pitchJitter, 5);
    const high = resolveCue(
      { kind: 'impact', pair: 'die-die', intensity: 1, worldX: 0 },
      () => 0.999999,
    );
    expect(high.fileIndex).toBe(SOUND_MANIFEST['die-clack'].files.length - 1);
    expect(high.playbackRate).toBeCloseTo(1 + AUDIO_TUNING.impact.pitchJitter, 4);
  });

  it('passes scheduled start times through', () => {
    const spec = resolveCue(
      { kind: 'impact', pair: 'die-felt', intensity: 1, worldX: 0, whenMs: 12_345 },
      () => 0,
    );
    expect(spec.whenMs).toBe(12_345);
  });
});

describe('panForWorldX', () => {
  it('maps the felt edges to ±pan width and clamps beyond', () => {
    expect(panForWorldX(0)).toBe(0);
    expect(panForWorldX(FELT_HALF_EXTENT.x)).toBeCloseTo(AUDIO_TUNING.pan.width, 5);
    expect(panForWorldX(-FELT_HALF_EXTENT.x * 99)).toBeCloseTo(-AUDIO_TUNING.pan.width, 5);
  });
});
