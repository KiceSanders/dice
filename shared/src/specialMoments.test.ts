import { describe, expect, it } from 'vitest';
import {
  isSpecialMomentEnabled,
  isSpecialMomentKind,
  isValidSpecialSoundWav,
  SPECIAL_MOMENT_DEFINITIONS,
  SPECIAL_SOUND_SAMPLE_RATE,
} from './specialMoments.js';
import { DEFAULT_SETTINGS } from './types.js';

function canonicalWav(sampleCount = 32): Uint8Array {
  const bytes = new Uint8Array(44 + sampleCount * 2);
  const view = new DataView(bytes.buffer);
  for (const [offset, text] of [
    [0, 'RIFF'],
    [8, 'WAVE'],
    [12, 'fmt '],
    [36, 'data'],
  ] as const) {
    for (let i = 0; i < text.length; i++) bytes[offset + i] = text.charCodeAt(i);
  }
  view.setUint32(4, bytes.length - 8, true);
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, SPECIAL_SOUND_SAMPLE_RATE, true);
  view.setUint32(28, SPECIAL_SOUND_SAMPLE_RATE * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  view.setUint32(40, sampleCount * 2, true);
  return bytes;
}

describe('special moment registry', () => {
  it('has unique ids and exposes every id to the runtime guard', () => {
    const kinds = SPECIAL_MOMENT_DEFINITIONS.map(({ kind }) => kind);
    expect(new Set(kinds).size).toBe(kinds.length);
    expect(kinds).toEqual([
      'straight',
      'classic',
      'first-roll-yahtzee',
      'yahtzee-bonus',
      'overtime-win',
    ]);
    for (const kind of kinds) expect(isSpecialMomentKind(kind)).toBe(true);
    expect(isSpecialMomentKind('round-win')).toBe(false);
    expect(isSpecialMomentEnabled(DEFAULT_SETTINGS, 'straight')).toBe(true);
    expect(
      isSpecialMomentEnabled(
        { ...DEFAULT_SETTINGS, straightPayout: { enabled: false, amountPerPlayer: 3 } },
        'straight',
      ),
    ).toBe(false);
    expect(isSpecialMomentEnabled(DEFAULT_SETTINGS, 'overtime-win')).toBe(true);
  });
});

describe('isValidSpecialSoundWav', () => {
  it('accepts canonical mono PCM and rejects malformed headers', () => {
    const valid = canonicalWav();
    expect(isValidSpecialSoundWav(valid)).toBe(true);
    const stereo = valid.slice();
    new DataView(stereo.buffer).setUint16(22, 2, true);
    expect(isValidSpecialSoundWav(stereo)).toBe(false);
    expect(isValidSpecialSoundWav(valid.subarray(0, valid.length - 2))).toBe(false);
  });
});
