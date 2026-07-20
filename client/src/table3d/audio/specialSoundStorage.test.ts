import { describe, expect, it } from 'vitest';
import { sanitizeSpecialSoundPack } from './specialSoundStorage';
import { bytesToBase64, encodeSpecialSoundWav } from './specialSoundWav';

describe('sanitizeSpecialSoundPack', () => {
  it('keeps valid known clips and drops unknown/corrupt values', () => {
    const wav = bytesToBase64(encodeSpecialSoundWav([new Float32Array(100).fill(0.1)], 22_050));
    expect(
      sanitizeSpecialSoundPack({
        version: 1,
        sounds: { straight: wav, 'round-win': wav, classic: 'not audio' },
      }),
    ).toEqual({ straight: wav });
  });
});
