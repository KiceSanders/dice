import { useSyncExternalStore } from 'react';
import { AUDIO_TUNING } from './audioTuning';

/**
 * Client-local audio preferences — per-device/browser, persisted in localStorage,
 * never wire-synced (deliberately not a RoomSettings field). Same
 * useSyncExternalStore + guarded-storage shape as dice/tuning.ts.
 */

export interface AudioSettings {
  /** 0–1 volume for dice, cup, chips, and built-in celebration cues. */
  effectsVolume: number;
  /** 0–1 volume for player-authored special-moment recordings. */
  recordingsVolume: number;
  muted: boolean;
}

const STORAGE_KEY = 'dice:audio';

export const DEFAULT_AUDIO_SETTINGS: AudioSettings = {
  effectsVolume: AUDIO_TUNING.settings.defaultVolume,
  recordingsVolume: AUDIO_TUNING.settings.defaultVolume,
  muted: false,
};

/** Clamp/repair anything that came out of storage. */
export function sanitizeAudioSettings(raw: unknown): AudioSettings {
  const source = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {};
  // Migrate the former single `volume` preference into both buses.
  const legacy = clampVolume(source.volume, AUDIO_TUNING.settings.defaultVolume);
  const effectsVolume = clampVolume(source.effectsVolume, legacy);
  const recordingsVolume = clampVolume(source.recordingsVolume, legacy);
  const muted = typeof source.muted === 'boolean' ? source.muted : DEFAULT_AUDIO_SETTINGS.muted;
  return { effectsVolume, recordingsVolume, muted };
}

function clampVolume(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.min(Math.max(value, 0), 1)
    : fallback;
}

function loadStored(): AudioSettings {
  if (typeof window === 'undefined') return DEFAULT_AUDIO_SETTINGS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? sanitizeAudioSettings(JSON.parse(raw)) : DEFAULT_AUDIO_SETTINGS;
  } catch {
    return DEFAULT_AUDIO_SETTINGS;
  }
}

let current: AudioSettings = loadStored();
const listeners = new Set<() => void>();

export function getAudioSettings(): AudioSettings {
  return current;
}

export function setAudioSettings(patch: Partial<AudioSettings>): void {
  current = sanitizeAudioSettings({ ...current, ...patch });
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
    } catch {
      // storage unavailable (private mode, quota) — settings still work in-memory
    }
  }
  for (const listener of listeners) listener();
}

export function subscribeAudioSettings(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useAudioSettings(): AudioSettings {
  return useSyncExternalStore(subscribeAudioSettings, getAudioSettings, () => current);
}
