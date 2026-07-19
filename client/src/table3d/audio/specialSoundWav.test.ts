import { isValidSpecialSoundWav, SPECIAL_SOUND_MAX_DURATION_MS } from '@dice/shared';
import { describe, expect, it } from 'vitest';
import { base64ToSpecialSoundBytes, bytesToBase64, encodeSpecialSoundWav } from './specialSoundWav';

describe('special sound WAV encoding', () => {
  it('resamples to the canonical portable format', () => {
    const oneSecond = new Float32Array(44_100).fill(0.25);
    const wav = encodeSpecialSoundWav([oneSecond], 44_100);
    expect(isValidSpecialSoundWav(wav)).toBe(true);
    expect(new DataView(wav.buffer).getUint32(24, true)).toBe(22_050);
    expect(new DataView(wav.buffer).getUint32(40, true)).toBe(22_050 * 2);
  });

  it('clamps oversized captures to three seconds and round-trips base64', () => {
    const tooLong = new Float32Array(48_000 * 5).fill(-0.5);
    const wav = encodeSpecialSoundWav([tooLong], 48_000);
    const dataBytes = new DataView(wav.buffer).getUint32(40, true);
    expect(dataBytes / 2 / 22_050).toBeLessThanOrEqual(SPECIAL_SOUND_MAX_DURATION_MS / 1_000);
    expect(base64ToSpecialSoundBytes(bytesToBase64(wav))).toEqual(wav);
  });
});
