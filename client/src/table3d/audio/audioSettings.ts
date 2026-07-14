import { useSyncExternalStore } from 'react';
import { AUDIO_TUNING } from './audioTuning';

/**
 * Client-local audio preferences — per-user, persisted in localStorage,
 * never wire-synced (deliberately not a RoomSettings field). Same
 * useSyncExternalStore + guarded-storage shape as dice/tuning.ts.
 */

export interface AudioSettings {
  /** 0–1 master volume. */
  volume: number;
  muted: boolean;
}

const STORAGE_KEY = 'dice:audio';

export const DEFAULT_AUDIO_SETTINGS: AudioSettings = {
  volume: AUDIO_TUNING.settings.defaultVolume,
  muted: false,
};

/** Clamp/repair anything that came out of storage. */
export function sanitizeAudioSettings(raw: unknown): AudioSettings {
  const source = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {};
  const volume =
    typeof source.volume === 'number' && Number.isFinite(source.volume)
      ? Math.min(Math.max(source.volume, 0), 1)
      : DEFAULT_AUDIO_SETTINGS.volume;
  const muted = typeof source.muted === 'boolean' ? source.muted : DEFAULT_AUDIO_SETTINGS.muted;
  return { volume, muted };
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
