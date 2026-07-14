import type { AudioCue } from './cues';

type CueListener = (cue: AudioCue) => void;

/**
 * Fire-and-forget cue bus between cue producers (rollerImpacts,
 * remotePoseAudio) and the one TableAudio subscriber. Deliberately NOT
 * tableEvents: impact cues are high-frequency and renderer-local, and the
 * sticky replay semantics that make tableEvents right for game facts would
 * replay stale clacks to late subscribers. Game-moment sounds stay on
 * tableEvents (see TableAudio.tsx).
 */
class AudioCueBus {
  private listeners = new Set<CueListener>();

  emit(cue: AudioCue): void {
    for (const listener of this.listeners) listener(cue);
  }

  on(listener: CueListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** Test hook. */
  reset(): void {
    this.listeners.clear();
  }
}

/** One table per page — module singleton, same shape as tableEvents. */
export const audioBus = new AudioCueBus();
