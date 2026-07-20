import {
  isSpecialMomentKind,
  SPECIAL_MOMENT_DEFINITIONS,
  SPECIAL_SOUND_MAX_BASE64_LENGTH,
  type SpecialMomentKind,
} from '@dice/shared';
import { useSyncExternalStore } from 'react';
import { base64ToSpecialSoundBytes } from './specialSoundWav';

export type SpecialSoundPack = Partial<Record<SpecialMomentKind, string>>;

export const SPECIAL_SOUND_STORAGE_KEY = 'dice:special-moment-sounds:v1';

export function sanitizeSpecialSoundPack(raw: unknown): SpecialSoundPack {
  const source =
    typeof raw === 'object' && raw !== null && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};
  const candidate =
    typeof source.sounds === 'object' && source.sounds !== null
      ? (source.sounds as Record<string, unknown>)
      : source;
  const result: SpecialSoundPack = {};
  for (const [kind, value] of Object.entries(candidate)) {
    if (
      isSpecialMomentKind(kind) &&
      typeof value === 'string' &&
      value.length <= SPECIAL_SOUND_MAX_BASE64_LENGTH &&
      base64ToSpecialSoundBytes(value) !== null
    ) {
      result[kind] = value;
    }
  }
  return result;
}

function loadStored(): SpecialSoundPack {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(SPECIAL_SOUND_STORAGE_KEY);
    return raw ? sanitizeSpecialSoundPack(JSON.parse(raw)) : {};
  } catch {
    return {};
  }
}

let current = loadStored();
const listeners = new Set<() => void>();

function emitChange(): void {
  for (const listener of listeners) listener();
}

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key !== SPECIAL_SOUND_STORAGE_KEY) return;
    current = loadStored();
    emitChange();
  });
}

export function getSpecialSoundPack(): SpecialSoundPack {
  return current;
}

/** Returns whether the new pack was persisted (it still works in-memory on quota failure). */
export function setSpecialSound(kind: SpecialMomentKind, wavBase64: string | null): boolean {
  const next = { ...current };
  if (wavBase64 === null) delete next[kind];
  else {
    if (base64ToSpecialSoundBytes(wavBase64) === null) return false;
    next[kind] = wavBase64;
  }

  let persisted = false;
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(
        SPECIAL_SOUND_STORAGE_KEY,
        JSON.stringify({ version: 1, sounds: next }),
      );
      persisted = true;
    } catch {
      // Private mode/quota failure: keep the clip for this tab and live room.
    }
  }
  current = next;
  emitChange();
  return persisted;
}

export function subscribeSpecialSounds(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useSpecialSoundPack(): SpecialSoundPack {
  return useSyncExternalStore(subscribeSpecialSounds, getSpecialSoundPack, () => current);
}

/** Stable complete wire view: missing local clips are explicit clears. */
export function completeSpecialSoundPack(
  pack: SpecialSoundPack,
): [SpecialMomentKind, string | null][] {
  return SPECIAL_MOMENT_DEFINITIONS.map(({ kind }) => [kind, pack[kind] ?? null]);
}
