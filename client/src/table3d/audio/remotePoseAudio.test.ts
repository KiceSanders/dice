import type { BodyPose, PoseFrame } from '@dice/shared';
import { describe, expect, it, vi } from 'vitest';
import { DICE_FELT_Y } from '../dice/constants';
import { REMOTE_PLAYBACK_DELAY_MS } from '../dice/remoteFeed';
import type { AudioCue } from './cues';
import { createRattleLevel } from './rattle';
import { createRemotePoseAudioTap } from './remotePoseAudio';

const FELT = DICE_FELT_Y;

function pose(x: number, y: number): BodyPose {
  return [x, y, 0, 0, 0, 0, 1];
}

/** Same landing shape as poseImpacts.test.ts: impact fires on the t0+150 frame. */
function landingFrames(t0: number): PoseFrame[] {
  const cup: BodyPose = [0, 5, 0, 0, 0, 0, 1];
  return [FELT + 0.15, FELT + 0.075, FELT, FELT, FELT].map((y, i) => ({
    t: t0 + i * 50,
    bodies: [cup, pose(0, y)],
    cupVisible: false,
  }));
}

function shakeFrames(t0: number): PoseFrame[] {
  const cup: BodyPose = [0, 0.8, 0, 0, 0, 0, 1];
  return [0, 0.05].map((x, i) => ({
    t: t0 + i * 50,
    bodies: [cup, pose(x, 0.8)],
    cupVisible: true,
  }));
}

function makeTap() {
  const cues: AudioCue[] = [];
  const rattle = createRattleLevel({
    decayPerSec: 0,
    forceScale: 1,
    feedMinForce: 0,
    tickThreshold: 1,
    loopGainMax: 1,
    minAudibleLevel: 0,
  });
  const tap = createRemotePoseAudioTap((cue) => cues.push(cue), rattle);
  return { tap, cues, rattle };
}

describe('createRemotePoseAudioTap', () => {
  it('anchors stream time to the local clock and schedules cues playback-delayed', () => {
    const { tap, cues } = makeTap();
    tap.push(landingFrames(0), 10_000);
    expect(cues).toHaveLength(1);
    const cue = cues[0];
    expect(cue?.kind).toBe('impact');
    // Impact frame is at stream t=150; anchor = 10_000 - 0.
    expect(cue?.whenMs).toBe(10_000 + 150 + REMOTE_PLAYBACK_DELAY_MS);
  });

  it('keeps the first-frame anchor across later pushes', () => {
    const { tap, cues } = makeTap();
    const frames = landingFrames(0);
    tap.push(frames.slice(0, 2), 10_000);
    tap.push(frames.slice(2), 10_500); // arrives late; anchor must not move
    expect(cues[0]?.whenMs).toBe(10_000 + 150 + REMOTE_PLAYBACK_DELAY_MS);
  });

  it('clear() re-anchors for the next throw', () => {
    const { tap, cues } = makeTap();
    tap.push(landingFrames(0), 10_000);
    tap.clear();
    tap.push(landingFrames(500), 20_000);
    expect(cues).toHaveLength(2);
    // New anchor = 20_000 - 500; impact frame at stream t = 650.
    expect(cues[1]?.whenMs).toBe(20_000 - 500 + 650 + REMOTE_PLAYBACK_DELAY_MS);
  });

  it('feeds in-cup shake into the rattle level', () => {
    const { tap, rattle } = makeTap();
    const raise = vi.spyOn(rattle, 'raiseTo');
    tap.push(shakeFrames(0), 10_000);
    expect(raise).toHaveBeenCalled();
    expect(rattle.level(10_000)).toBeGreaterThan(0.5);
  });
});
