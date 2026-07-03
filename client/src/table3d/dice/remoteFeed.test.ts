import { describe, expect, it } from 'vitest';
import type { BodyPose, PoseFrame } from '@dice/shared';
import { lerpPose, RemoteRollFeed } from './remoteFeed';

const pose = (x: number, qw = 1, qz = 0): BodyPose => [x, 0, 0, 0, 0, qz, qw];
const frame = (t: number, x: number, cupVisible?: boolean): PoseFrame => ({
  t,
  bodies: [pose(x), pose(x + 10)],
  ...(cupVisible === undefined ? {} : { cupVisible }),
});

describe('RemoteRollFeed', () => {
  it('is null while empty, clears back to empty', () => {
    const feed = new RemoteRollFeed();
    expect(feed.sample(1000)).toBeNull();
    feed.push([frame(0, 1)], 1000);
    expect(feed.sample(2000)).not.toBeNull();
    feed.clear();
    expect(feed.empty).toBe(true);
    expect(feed.sample(2000)).toBeNull();
  });

  it('anchors stream time to arrival and interpolates between frames', () => {
    const feed = new RemoteRollFeed();
    // Stream t=1000/1100 arrives at local 5000 → localT 5000/5100.
    feed.push([frame(1000, 0), frame(1100, 10)], 5000);
    // Playback delay 150ms: local 5200 reads stream position 5050 → halfway.
    const mid = feed.sample(5200, 150)!;
    expect(mid.bodies[0]![0]).toBeCloseTo(5);
    expect(mid.bodies[1]![0]).toBeCloseTo(15); // second body interpolates too
  });

  it('clamps to the first frame early and freezes on the last frame late', () => {
    const feed = new RemoteRollFeed();
    feed.push([frame(0, 1), frame(100, 9)], 5000);
    expect(feed.sample(5000, 150)!.bodies[0]![0]).toBe(1); // before first
    expect(feed.sample(9999, 150)!.bodies[0]![0]).toBe(9); // stalled stream
  });

  it('keeps the anchor across later batches (mid-throw join works)', () => {
    const feed = new RemoteRollFeed();
    feed.push([frame(8000, 0)], 5000); // joined mid-throw: anchor = -3000
    feed.push([frame(8100, 10)], 5080); // later batch, same stream clock
    const mid = feed.sample(5200, 150)!; // stream position 8050
    expect(mid.bodies[0]![0]).toBeCloseTo(5);
  });

  it('carries cupVisible from frames, defaulting to true', () => {
    const feed = new RemoteRollFeed();
    feed.push([frame(0, 1), frame(100, 2, false)], 5000);
    expect(feed.sample(5000, 150)!.cupVisible).toBe(true);
    expect(feed.sample(9000, 150)!.cupVisible).toBe(false);
  });

  it('drops frames once newer ones also pass the retention window', () => {
    const feed = new RemoteRollFeed();
    feed.push([frame(0, 1)], 1000); // localT 1000
    feed.push([frame(100, 2)], 1100); // localT 1100
    feed.push([frame(10_000, 3)], 11_000); // cutoff 6000 → t=0 frame pruned
    // Sampling before the retained range clamps to the oldest survivor (x=2).
    expect(feed.sample(1000, 0)!.bodies[0]![0]).toBe(2);
  });
});

describe('lerpPose', () => {
  it('lerps position and normalizes the quaternion', () => {
    const a: BodyPose = [0, 0, 0, 0, 0, 0, 1];
    const b: BodyPose = [2, 4, 6, 0, 0, 1, 0]; // 180° about Z
    const mid = lerpPose(a, b, 0.5);
    expect(mid.slice(0, 3)).toEqual([1, 2, 3]);
    const len = Math.hypot(mid[3], mid[4], mid[5], mid[6]);
    expect(len).toBeCloseTo(1);
  });

  it('takes the shortest quaternion path when signs flip', () => {
    const a: BodyPose = [0, 0, 0, 0, 0, 0, 1];
    const negated: BodyPose = [0, 0, 0, 0, 0, 0, -1]; // same rotation, flipped sign
    const mid = lerpPose(a, negated, 0.5);
    // Without the sign flip this would collapse toward zero and blow up on
    // normalize; with it, the rotation stays identity.
    expect(Math.abs(mid[6])).toBeCloseTo(1);
  });
});
