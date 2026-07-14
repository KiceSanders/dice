import type { PoseFrame } from '@dice/shared';
import { REMOTE_PLAYBACK_DELAY_MS } from '../dice/remoteFeed';
import { audioBus } from './audioBus';
import { AUDIO_TUNING } from './audioTuning';
import type { AudioCue } from './cues';
import { createPoseImpactDetector } from './poseImpacts';
import { tableRattle } from './rattle';

/**
 * Spectator audio tap: fed the same view-space frames as RemoteRollFeed
 * (see useRemoteRoll.ts), it derives impacts via poseImpacts and emits them
 * as cues scheduled REMOTE_PLAYBACK_DELAY_MS into the future — the visual
 * playback runs that far in the past, so sound and picture line up. Frame
 * `t` values are stream-relative; the first push anchors them to the local
 * clock exactly like RemoteRollFeed does.
 */
export function createRemotePoseAudioTap(
  emit: (cue: AudioCue) => void = (cue) => audioBus.emit(cue),
  rattle = tableRattle,
) {
  const detector = createPoseImpactDetector(AUDIO_TUNING.pose);
  let anchor: number | null = null;

  return {
    push(frames: PoseFrame[], now: number = performance.now()): void {
      for (const frame of frames) {
        if (anchor === null) anchor = now - frame.t;
        const { impacts, shakeLevel } = detector.push(frame);
        const whenMs = anchor + frame.t + REMOTE_PLAYBACK_DELAY_MS;
        for (const impact of impacts) {
          emit({ kind: 'impact', ...impact, whenMs });
        }
        // The rattle loop is continuous texture — a 150 ms phase offset is
        // inaudible, so shake feeds the live level rather than scheduling.
        if (shakeLevel > 0) rattle.raiseTo(shakeLevel, now);
      }
    },

    clear(): void {
      detector.reset();
      anchor = null;
    },
  };
}

export type RemotePoseAudioTap = ReturnType<typeof createRemotePoseAudioTap>;
