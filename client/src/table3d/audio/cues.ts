import { FELT_HALF_EXTENT } from '../layout';
import { AUDIO_TUNING, type SurfacePair } from './audioTuning';
import { SOUND_MANIFEST, type SoundId } from './sampleManifest';

/**
 * One thing the table wants heard. Impacts come from physics contacts
 * (roller) or pose-stream derivation (spectators); one-shots come from
 * tableEvents game moments. Cues travel over audioBus.ts and are resolved
 * here into a concrete PlaySpec for the engine.
 */
export type AudioCue =
  | {
      kind: 'impact';
      pair: SurfacePair;
      /** 0–1 from the gate/detector; scales gain. */
      intensity: number;
      worldX: number;
      /** performance.now()-clock start time (spectator sync); immediate if absent. */
      whenMs?: number;
    }
  | {
      kind: 'one-shot';
      id: SoundId;
      worldX?: number;
      gainScale?: number;
      whenMs?: number;
    };

export interface PlaySpec {
  soundId: SoundId;
  fileIndex: number;
  gain: number;
  playbackRate: number;
  /** -1..1 stereo position. */
  pan: number;
  whenMs?: number;
}

/** Which sample each surface pair plays. In-cup contacts reuse the clack, quieter. */
const IMPACT_SOUND: Record<SurfacePair, { id: SoundId; gainScale: number }> = {
  'die-die': { id: 'die-clack', gainScale: 1 },
  'die-felt': { id: 'die-felt', gainScale: 1 },
  'die-rail': { id: 'die-rail', gainScale: 1 },
  'die-wall': { id: 'die-rail', gainScale: 0.8 },
  'die-cup': { id: 'die-clack', gainScale: 0.55 },
  'die-lid': { id: 'die-clack', gainScale: 0.55 },
};

/** Soft floor so low-intensity impacts are quiet, not inaudible. */
const IMPACT_GAIN_FLOOR = 0.35;

export function panForWorldX(worldX: number): number {
  const normalized = Math.min(Math.max(worldX / FELT_HALF_EXTENT.x, -1), 1);
  return normalized * AUDIO_TUNING.pan.width;
}

/**
 * Cue → concrete play parameters. `rng` is injectable for tests; each call
 * picks a random sample variation and pitch so repeats never sound stamped.
 */
export function resolveCue(cue: AudioCue, rng: () => number = Math.random): PlaySpec {
  const jitter = 1 + (rng() * 2 - 1) * AUDIO_TUNING.impact.pitchJitter;

  if (cue.kind === 'impact') {
    const { id, gainScale } = IMPACT_SOUND[cue.pair];
    const sample = SOUND_MANIFEST[id];
    const intensity = Math.min(Math.max(cue.intensity, 0), 1);
    return {
      soundId: id,
      fileIndex: Math.min(Math.floor(rng() * sample.files.length), sample.files.length - 1),
      gain: sample.baseGain * gainScale * (IMPACT_GAIN_FLOOR + (1 - IMPACT_GAIN_FLOOR) * intensity),
      playbackRate: jitter,
      pan: panForWorldX(cue.worldX),
      whenMs: cue.whenMs,
    };
  }

  const sample = SOUND_MANIFEST[cue.id];
  return {
    soundId: cue.id,
    fileIndex: Math.min(Math.floor(rng() * sample.files.length), sample.files.length - 1),
    gain: sample.baseGain * (cue.gainScale ?? 1),
    playbackRate: jitter,
    pan: cue.worldX === undefined ? 0 : panForWorldX(cue.worldX),
    whenMs: cue.whenMs,
  };
}
