import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { audioUrl, SOUND_MANIFEST } from './sampleManifest';

const AUDIO_DIR = fileURLToPath(new URL('../../../public/audio/', import.meta.url));

describe('SOUND_MANIFEST', () => {
  it('every referenced file exists in client/public/audio/', () => {
    for (const [id, sample] of Object.entries(SOUND_MANIFEST)) {
      expect(sample.files.length, `${id} needs at least one file`).toBeGreaterThan(0);
      for (const file of sample.files) {
        expect(existsSync(AUDIO_DIR + file), `${id}: missing ${file}`).toBe(true);
      }
    }
  });

  it('base gains stay inside the unit range', () => {
    for (const [id, sample] of Object.entries(SOUND_MANIFEST)) {
      expect(sample.baseGain, id).toBeGreaterThan(0);
      expect(sample.baseGain, id).toBeLessThanOrEqual(1);
    }
  });

  it('only the rattle loop is marked loopable', () => {
    for (const [id, sample] of Object.entries(SOUND_MANIFEST)) {
      expect(Boolean(sample.loop), id).toBe(id === 'cup-rattle-loop');
    }
  });

  it('audioUrl builds public URLs under the Vite base', () => {
    expect(audioUrl('die-clack-1.wav')).toBe(`${import.meta.env.BASE_URL}audio/die-clack-1.wav`);
  });
});
