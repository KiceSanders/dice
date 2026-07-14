import { useEffect } from 'react';
import { useTableEvent } from '../tableEvents';
import { audioBus } from './audioBus';
import { audioEngine } from './audioEngine';
import { useAudioSettings } from './audioSettings';
import { AUDIO_TUNING } from './audioTuning';
import { resolveCue } from './cues';
import { tableRattle } from './rattle';
import type { SoundId } from './sampleManifest';

/**
 * The one audio subscriber — mounted once per Room, OUTSIDE the canvas, so
 * it exists for the roller, spectators, and between turns regardless of
 * which dice renderer is up (the three-renderer rule can't be violated by
 * construction). Renders nothing.
 *
 * - audioBus cues (physics impacts, pose-derived impacts) → engine.
 * - tableEvents game moments → one-shot cues. Future game SFX: emit the
 *   tableEvents member as usual and add one subscription line here.
 * - Polls the shared rattle level into the loop gain (~30 Hz).
 * - Unlocks/preloads the engine on the first user gesture (autoplay policy).
 */

/** Long enough for the same-commit late mount, short enough to never feel stale. */
const ONE_SHOT_REPLAY_MS = 500;
const RATTLE_POLL_MS = 33;

export default function TableAudio() {
  const settings = useAudioSettings();

  useEffect(() => {
    audioEngine.setVolume(settings.volume);
    audioEngine.setMuted(settings.muted);
  }, [settings]);

  useEffect(() => {
    // Kept attached: unlock() is idempotent and re-resumes a suspended context.
    const unlock = () => audioEngine.unlock();
    window.addEventListener('pointerdown', unlock, true);
    window.addEventListener('keydown', unlock, true);
    const offBus = audioBus.on((cue) => audioEngine.play(resolveCue(cue)));
    const poll = window.setInterval(() => {
      const level = tableRattle.level(performance.now());
      // Hard-gate sub-audible levels: nothing moving → truly silent.
      audioEngine.setRattleGain(level < AUDIO_TUNING.rattle.minAudibleLevel ? 0 : level);
    }, RATTLE_POLL_MS);
    return () => {
      window.removeEventListener('pointerdown', unlock, true);
      window.removeEventListener('keydown', unlock, true);
      offBus();
      window.clearInterval(poll);
    };
  }, []);

  const oneShot = (id: SoundId) => audioBus.emit({ kind: 'one-shot', id });
  useTableEvent('straight', () => oneShot('straight-bell'), { replayLastMs: ONE_SHOT_REPLAY_MS });
  useTableEvent('chips-to-pot', () => oneShot('chip-stack'), { replayLastMs: ONE_SHOT_REPLAY_MS });
  useTableEvent('chips-to-classic-pot', () => oneShot('chip-stack'), {
    replayLastMs: ONE_SHOT_REPLAY_MS,
  });
  useTableEvent('chips-between-players', () => oneShot('chip-collide'), {
    replayLastMs: ONE_SHOT_REPLAY_MS,
  });
  useTableEvent('pot-to-winner', () => oneShot('chip-collide'), {
    replayLastMs: ONE_SHOT_REPLAY_MS,
  });
  useTableEvent('classic-pot-to-winner', () => oneShot('chip-collide'), {
    replayLastMs: ONE_SHOT_REPLAY_MS,
  });

  return null;
}
