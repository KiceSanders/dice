/**
 * Every playable sound, by id. The manifest is the ONLY place audio
 * filenames appear — to swap a recording, replace the file in
 * client/public/audio/ (run it through scripts/normalize-audio.sh first and
 * add a CREDITS.md line); to add a sound, add an id here and map a cue to it
 * in cues.ts. `files` entries are round-robin variations picked at random
 * per play so repeated impacts don't sound machine-gunned.
 */

export type SoundId =
  | 'die-clack'
  | 'die-felt'
  | 'die-rail'
  | 'cup-pour'
  | 'cup-rattle-loop'
  | 'chip-stack'
  | 'chip-collide'
  | 'straight-bell';

export interface SampleDef {
  /** Filenames under client/public/audio/ — one is chosen per play. */
  files: string[];
  /** Gain at full intensity, before the per-cue intensity curve. */
  baseGain: number;
  /** Seamless loop (the engine keeps one persistent source for these). */
  loop?: boolean;
}

export const SOUND_MANIFEST: Record<SoundId, SampleDef> = {
  'die-clack': {
    files: ['die-clack-1.wav', 'die-clack-2.wav', 'die-clack-3.wav', 'die-clack-4.wav'],
    baseGain: 0.9,
  },
  'die-felt': {
    files: ['die-felt-1.wav', 'die-felt-2.wav', 'die-felt-3.wav', 'die-felt-4.wav'],
    baseGain: 1,
  },
  'die-rail': {
    files: ['die-rail-1.wav', 'die-rail-2.wav'],
    baseGain: 0.8,
  },
  'cup-pour': {
    files: ['cup-pour-1.wav', 'cup-pour-2.wav'],
    baseGain: 0.9,
  },
  'cup-rattle-loop': {
    files: ['cup-rattle-loop.wav'],
    baseGain: 1,
    loop: true,
  },
  'chip-stack': {
    files: ['chip-stack-1.wav', 'chip-stack-2.wav', 'chip-stack-3.wav'],
    baseGain: 0.7,
  },
  'chip-collide': {
    files: ['chip-collide-1.wav', 'chip-collide-2.wav', 'chip-collide-3.wav'],
    baseGain: 0.7,
  },
  'straight-bell': {
    files: ['straight-bell-1.wav'],
    baseGain: 0.5,
  },
};

/** Public URL for a manifest filename (Vite serves client/public/ at BASE_URL). */
export function audioUrl(file: string): string {
  return `${import.meta.env.BASE_URL}audio/${file}`;
}
