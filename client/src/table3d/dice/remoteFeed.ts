import type { BodyPose, PoseFrame } from '@dice/shared';

/** Interpolation delay: hides network jitter at the cost of ~2 frame periods. */
export const REMOTE_PLAYBACK_DELAY_MS = 150;

/** Frames older than this are dropped; the buffer never grows past a throw. */
const BUFFER_RETENTION_MS = 5_000;

interface BufferedFrame {
  /** Local-clock time this frame represents (stream t re-anchored on arrival). */
  localT: number;
  bodies: BodyPose[];
  cupVisible: boolean;
}

export interface RemoteRollSample {
  bodies: BodyPose[];
  cupVisible: boolean;
}

/**
 * Playback buffer for a remote roller's dice:frames stream (ADR 004).
 * Frames carry stream-relative timestamps; the first arrival anchors them to
 * the local clock, and `sample()` reads the interpolated scene slightly in
 * the past so gaps between batches never show as stutter. No physics — the
 * spectator renders exactly what the roller's simulation produced.
 */
export class RemoteRollFeed {
  private frames: BufferedFrame[] = [];
  private anchor: number | null = null;

  push(frames: PoseFrame[], now: number = performance.now()): void {
    for (const frame of frames) {
      if (this.anchor === null) this.anchor = now - frame.t;
      this.frames.push({
        localT: this.anchor + frame.t,
        bodies: frame.bodies,
        cupVisible: frame.cupVisible ?? true,
      });
    }
    const cutoff = now - BUFFER_RETENTION_MS;
    while (this.frames.length > 2 && this.frames[1]!.localT < cutoff) this.frames.shift();
  }

  clear(): void {
    this.frames.length = 0;
    this.anchor = null;
  }

  get empty(): boolean {
    return this.frames.length === 0;
  }

  /**
   * Interpolated scene at (now − delay). Clamps to the first/last frame
   * outside the buffered range, so a stalled stream freezes rather than
   * extrapolating. Null while nothing has arrived.
   */
  sample(
    now: number = performance.now(),
    delayMs: number = REMOTE_PLAYBACK_DELAY_MS,
  ): RemoteRollSample | null {
    const fs = this.frames;
    if (fs.length === 0) return null;
    const rt = now - delayMs;

    const first = fs[0]!;
    if (rt <= first.localT) return { bodies: first.bodies, cupVisible: first.cupVisible };
    const last = fs[fs.length - 1]!;
    if (rt >= last.localT) return { bodies: last.bodies, cupVisible: last.cupVisible };

    let hi = 1;
    while (fs[hi]!.localT < rt) hi++;
    const a = fs[hi - 1]!;
    const b = fs[hi]!;
    const span = b.localT - a.localT;
    const k = span > 0 ? (rt - a.localT) / span : 1;
    return {
      bodies: a.bodies.map((pose, i) => lerpPose(pose, b.bodies[i] ?? pose, k)),
      cupVisible: b.cupVisible,
    };
  }
}

/** Position lerp + quaternion nlerp (shortest path). Frames are ~50 ms apart. */
export function lerpPose(a: BodyPose, b: BodyPose, k: number): BodyPose {
  const x = a[0] + (b[0] - a[0]) * k;
  const y = a[1] + (b[1] - a[1]) * k;
  const z = a[2] + (b[2] - a[2]) * k;

  const dot = a[3] * b[3] + a[4] * b[4] + a[5] * b[5] + a[6] * b[6];
  const s = dot < 0 ? -1 : 1;
  let qx = a[3] + (b[3] * s - a[3]) * k;
  let qy = a[4] + (b[4] * s - a[4]) * k;
  let qz = a[5] + (b[5] * s - a[5]) * k;
  let qw = a[6] + (b[6] * s - a[6]) * k;
  const len = Math.hypot(qx, qy, qz, qw) || 1;
  qx /= len;
  qy /= len;
  qz /= len;
  qw /= len;

  return [x, y, z, qx, qy, qz, qw];
}
