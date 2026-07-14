import type { BodyPose, PoseFrame } from '@dice/shared';
import { describe, expect, it } from 'vitest';
import { DICE_FELT_Y, FELT_BOUND_X } from '../dice/constants';
import { AUDIO_TUNING } from './audioTuning';
import { createPoseImpactDetector } from './poseImpacts';

const FELT = DICE_FELT_Y;
const CUP_AWAY: BodyPose = [0, 5, 0, 0, 0, 0, 1];

function pose(x: number, y: number, z = 0): BodyPose {
  return [x, y, z, 0, 0, 0, 1];
}

function frame(
  t: number,
  dice: BodyPose[],
  cup: BodyPose = CUP_AWAY,
  cupVisible = false,
): PoseFrame {
  return { t, bodies: [cup, ...dice], cupVisible };
}

/** A die falling at 1.5 m/s that lands (stops) on the felt at the given x. */
function landingFrames(x: number, t0 = 0): PoseFrame[] {
  return [
    frame(t0, [pose(x, FELT + 0.15)]),
    frame(t0 + 50, [pose(x, FELT + 0.075)]),
    frame(t0 + 100, [pose(x, FELT)]),
    frame(t0 + 150, [pose(x, FELT)]),
    frame(t0 + 200, [pose(x, FELT)]),
  ];
}

describe('createPoseImpactDetector', () => {
  it('a fall onto the felt yields exactly one die-felt impact with sane intensity', () => {
    const detector = createPoseImpactDetector(AUDIO_TUNING.pose);
    const impacts = landingFrames(0).flatMap((f) => detector.push(f).impacts);
    expect(impacts).toHaveLength(1);
    expect(impacts[0]?.pair).toBe('die-felt');
    expect(impacts[0]?.worldX).toBe(0);
    // Pre-impact speed 1.5 m/s against refSpeed: sqrt(1.5 / 2.5).
    expect(impacts[0]?.intensity).toBeCloseTo(Math.sqrt(1.5 / AUDIO_TUNING.pose.refSpeed), 5);
  });

  it('a low stop near the felt edge classifies as the rail', () => {
    const detector = createPoseImpactDetector(AUDIO_TUNING.pose);
    const x = FELT_BOUND_X * 0.9;
    const impacts = landingFrames(x).flatMap((f) => detector.push(f).impacts);
    expect(impacts).toHaveLength(1);
    expect(impacts[0]?.pair).toBe('die-rail');
  });

  it('resting dice with mm-quantization jitter stay silent', () => {
    const detector = createPoseImpactDetector(AUDIO_TUNING.pose);
    const impacts = [0, 50, 100, 150, 200].flatMap(
      (t, i) => detector.push(frame(t, [pose((i % 2) * 0.001, FELT)])).impacts,
    );
    expect(impacts).toHaveLength(0);
  });

  it('two dice converging then stopping read as die-die clacks', () => {
    const detector = createPoseImpactDetector(AUDIO_TUNING.pose);
    detector.push(frame(0, [pose(-0.2, FELT), pose(0.2, FELT)]));
    detector.push(frame(50, [pose(-0.1, FELT), pose(0.1, FELT)]));
    const { impacts } = detector.push(frame(100, [pose(-0.05, FELT), pose(0.05, FELT)]));
    expect(impacts.length).toBeGreaterThan(0);
    for (const impact of impacts) expect(impact.pair).toBe('die-die');
  });

  it('in-cup circular motion produces shake, no impacts, and die-cup on hits', () => {
    const detector = createPoseImpactDetector(AUDIO_TUNING.pose);
    const cup: BodyPose = [0, 0.8, 0, 0, 0, 0, 1];
    detector.push(frame(0, [pose(0, 0.8)], cup, true));
    const steady = detector.push(frame(50, [pose(0.05, 0.8)], cup, true));
    expect(steady.impacts).toHaveLength(0);
    expect(steady.shakeLevel).toBeCloseTo(1 / AUDIO_TUNING.pose.shakeSpeedFull, 5);
    // The die stops hard against the cup wall → die-cup impact.
    const hit = detector.push(frame(100, [pose(0.05, 0.8)], cup, true));
    expect(hit.impacts).toHaveLength(1);
    expect(hit.impacts[0]?.pair).toBe('die-cup');
  });

  it('shake is zero once the cup is out of play', () => {
    const detector = createPoseImpactDetector(AUDIO_TUNING.pose);
    const cup: BodyPose = [0, 0.8, 0, 0, 0, 0, 1];
    detector.push(frame(0, [pose(0, 0.8)], cup, false));
    const result = detector.push(frame(50, [pose(0.05, 0.8)], cup, false));
    expect(result.shakeLevel).toBe(0);
  });

  it('caps impacts per frame at the strongest maxImpactsPerFrame', () => {
    const detector = createPoseImpactDetector(AUDIO_TUNING.pose);
    const xs = [-0.9, -0.3, 0.3, 0.9];
    const at = (y: number) => xs.map((x) => pose(x, y));
    detector.push(frame(0, at(FELT + 0.15)));
    detector.push(frame(50, at(FELT + 0.075)));
    detector.push(frame(100, at(FELT)));
    const { impacts } = detector.push(frame(150, at(FELT)));
    expect(impacts).toHaveLength(AUDIO_TUNING.pose.maxImpactsPerFrame);
  });

  it('slow-cadence frames (selecting phase) never sound, even across big jumps', () => {
    const detector = createPoseImpactDetector(AUDIO_TUNING.pose);
    // 250 ms sampling: a kept die teleports 0.8 m to the rail, then rests.
    const impacts = [
      frame(0, [pose(0, FELT)]),
      frame(250, [pose(0.8, FELT)]),
      frame(500, [pose(0.8, FELT)]),
      frame(750, [pose(0.8, FELT)]),
    ].flatMap((f) => detector.push(f).impacts);
    expect(impacts).toHaveLength(0);
  });

  it('physically impossible displacement is a teleport, not an impact', () => {
    const detector = createPoseImpactDetector(AUDIO_TUNING.pose);
    // 50 ms cadence, but the die jumps 1 m (20 m/s — above any clamped speed).
    const impacts = [
      frame(0, [pose(0, FELT)]),
      frame(50, [pose(1, FELT)]),
      frame(100, [pose(1, FELT)]),
      frame(150, [pose(1, FELT)]),
    ].flatMap((f) => detector.push(f).impacts);
    expect(impacts).toHaveLength(0);
  });

  it('ignores out-of-order and duplicate-timestamp frames', () => {
    const detector = createPoseImpactDetector(AUDIO_TUNING.pose);
    detector.push(frame(100, [pose(0, FELT + 0.15)]));
    expect(detector.push(frame(100, [pose(0, FELT)])).impacts).toHaveLength(0);
    expect(detector.push(frame(50, [pose(0, FELT)])).impacts).toHaveLength(0);
  });

  it('reset forgets motion history', () => {
    const detector = createPoseImpactDetector(AUDIO_TUNING.pose);
    for (const f of landingFrames(0).slice(0, 3)) detector.push(f);
    detector.reset();
    expect(detector.push(frame(150, [pose(0, FELT)])).impacts).toHaveLength(0);
  });
});
