import { describe, expect, it } from 'vitest';
import { DEFAULT_AUDIO_SETTINGS, sanitizeAudioSettings } from './audioSettings';

describe('sanitizeAudioSettings', () => {
  it('passes valid settings through', () => {
    expect(sanitizeAudioSettings({ volume: 0.4, muted: true })).toEqual({
      volume: 0.4,
      muted: true,
    });
  });

  it('clamps volume into 0..1', () => {
    expect(sanitizeAudioSettings({ volume: 3, muted: false }).volume).toBe(1);
    expect(sanitizeAudioSettings({ volume: -1, muted: false }).volume).toBe(0);
  });

  it('falls back to defaults on garbage', () => {
    expect(sanitizeAudioSettings(null)).toEqual(DEFAULT_AUDIO_SETTINGS);
    expect(sanitizeAudioSettings('nope')).toEqual(DEFAULT_AUDIO_SETTINGS);
    expect(sanitizeAudioSettings({ volume: Number.NaN, muted: 'yes' })).toEqual(
      DEFAULT_AUDIO_SETTINGS,
    );
  });
});
