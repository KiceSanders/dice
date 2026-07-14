import { afterEach, describe, expect, it, vi } from 'vitest';
import { audioBus } from './audioBus';
import type { AudioCue } from './cues';

afterEach(() => {
  audioBus.reset();
});

const CUE: AudioCue = { kind: 'impact', pair: 'die-felt', intensity: 0.5, worldX: 0 };

describe('audioBus', () => {
  it('delivers cues to subscribers', () => {
    const handler = vi.fn();
    audioBus.on(handler);
    audioBus.emit(CUE);
    expect(handler).toHaveBeenCalledExactlyOnceWith(CUE);
  });

  it('unsubscribe stops delivery', () => {
    const handler = vi.fn();
    const off = audioBus.on(handler);
    off();
    audioBus.emit(CUE);
    expect(handler).not.toHaveBeenCalled();
  });

  it('never replays to late subscribers (unlike tableEvents, by design)', () => {
    audioBus.emit(CUE);
    const handler = vi.fn();
    audioBus.on(handler);
    expect(handler).not.toHaveBeenCalled();
  });
});
