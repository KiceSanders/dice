import { describe, expect, it } from 'vitest';
import { DEFAULT_AUDIO_SETTINGS, sanitizeAudioSettings } from './audioSettings';

describe('sanitizeAudioSettings', () => {
  it('passes valid settings through', () => {
    expect(
      sanitizeAudioSettings({ effectsVolume: 0.4, recordingsVolume: 0.7, muted: true }),
    ).toEqual({
      effectsVolume: 0.4,
      recordingsVolume: 0.7,
      muted: true,
    });
  });

  it('clamps both volumes into 0..1', () => {
    const settings = sanitizeAudioSettings({
      effectsVolume: 3,
      recordingsVolume: -1,
      muted: false,
    });
    expect(settings.effectsVolume).toBe(1);
    expect(settings.recordingsVolume).toBe(0);
  });

  it('migrates the former single volume into both buses', () => {
    expect(sanitizeAudioSettings({ volume: 0.4, muted: false })).toEqual({
      effectsVolume: 0.4,
      recordingsVolume: 0.4,
      muted: false,
    });
  });

  it('falls back to defaults on garbage', () => {
    expect(sanitizeAudioSettings(null)).toEqual(DEFAULT_AUDIO_SETTINGS);
    expect(sanitizeAudioSettings('nope')).toEqual(DEFAULT_AUDIO_SETTINGS);
    expect(sanitizeAudioSettings({ effectsVolume: Number.NaN, muted: 'yes' })).toEqual(
      DEFAULT_AUDIO_SETTINGS,
    );
  });
});
