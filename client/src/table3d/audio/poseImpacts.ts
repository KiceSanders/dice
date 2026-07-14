import type { BodyPose, PoseFrame } from '@dice/shared';
import { FELT_BOUND_X, FELT_BOUND_Z } from '../dice/constants';
import type { AudioTuning, SurfacePair } from './audioTuning';

/**
 * Spectator-side impact derivation (three-renderer rule): spectators replay
 * streamed poses with no physics bodies, so collision events never exist for
 * them. This detector reconstructs audible impacts from the raw ~20 Hz frame
 * stream instead — a die that was moving and sharply decelerated (or stopped
 * falling) hit something; what it hit is classified from geometry. Positions
 * are mm-rounded at ~50 ms spacing (~0.02 m/s velocity quantization), so all
 * thresholds sit far above the noise floor. Pure: no clocks, no Web Audio.
 */

export interface PoseImpact {
  pair: SurfacePair;
  intensity: number;
  worldX: number;
}

export interface PoseAudioResult {
  impacts: PoseImpact[];
  /** 0–1 in-cup agitation this frame (0 whenever the cup is out of play). */
  shakeLevel: number;
}

interface BodyMotion {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  speed: number;
  /** Displacement was physically impossible — a declarative reposition. */
  teleported: boolean;
}

const EMPTY: PoseAudioResult = { impacts: [], shakeLevel: 0 };

export function createPoseImpactDetector(tuning: AudioTuning['pose']) {
  let prevFrame: PoseFrame | null = null;
  let prevMotion: (BodyMotion | null)[] = [];

  return {
    push(frame: PoseFrame): PoseAudioResult {
      const last = prevFrame;
      const lastMotion = prevMotion;
      prevFrame = frame;
      prevMotion = [];

      if (last === null || frame.t <= last.t) return EMPTY;
      const dt = (frame.t - last.t) / 1000;
      // Slow-cadence frames (selecting phase) reposition dice declaratively —
      // velocities across the gap are meaningless. Keep positions, zero motion.
      const wideGap = frame.t - last.t > tuning.maxFrameGapMs;

      const cupVisible = frame.cupVisible ?? true;
      const cup = frame.bodies[0];
      const motions: (BodyMotion | null)[] = frame.bodies.map((pose, i) => {
        const prev = last.bodies[i];
        if (prev === undefined) return null;
        const vx = (pose[0] - prev[0]) / dt;
        const vy = (pose[1] - prev[1]) / dt;
        const vz = (pose[2] - prev[2]) / dt;
        const speed = Math.hypot(vx, vy, vz);
        if (wideGap || speed > tuning.maxPlausibleSpeed) {
          return {
            x: pose[0],
            y: pose[1],
            z: pose[2],
            vx: 0,
            vy: 0,
            vz: 0,
            speed: 0,
            teleported: true,
          };
        }
        return { x: pose[0], y: pose[1], z: pose[2], vx, vy, vz, speed, teleported: false };
      });
      prevMotion = motions;
      if (wideGap) return EMPTY;

      const impacts: PoseImpact[] = [];
      let cupSpeedSum = 0;
      let cupDieCount = 0;

      // bodies[0] is the koozie; dice follow in hand-index order.
      for (let i = 1; i < motions.length; i++) {
        const now = motions[i];
        const before = lastMotion[i];
        if (!now || now.teleported) continue;

        const inCup = cupVisible && cup !== undefined && isNearCup(now, cup, tuning);
        if (inCup) {
          cupSpeedSum += now.speed;
          cupDieCount++;
        }
        if (!before) continue;
        if (before.speed < tuning.minImpactSpeed) continue;

        const decelerated = before.speed - now.speed >= tuning.minDecel;
        const stoppedFalling = before.vy <= -tuning.minFallSpeed && now.vy >= -0.05;
        if (!decelerated && !stoppedFalling) continue;

        impacts.push({
          pair: classifyPoseImpact(now, motions, i, inCup, tuning),
          intensity: Math.sqrt(Math.min(before.speed / tuning.refSpeed, 1)),
          worldX: now.x,
        });
      }

      impacts.sort((a, b) => b.intensity - a.intensity);
      impacts.length = Math.min(impacts.length, tuning.maxImpactsPerFrame);

      const shakeLevel =
        cupDieCount > 0 ? Math.min(cupSpeedSum / cupDieCount / tuning.shakeSpeedFull, 1) : 0;
      return { impacts, shakeLevel };
    },

    reset(): void {
      prevFrame = null;
      prevMotion = [];
    },
  };
}

export type PoseImpactDetector = ReturnType<typeof createPoseImpactDetector>;

function isNearCup(die: BodyMotion, cup: BodyPose, tuning: AudioTuning['pose']): boolean {
  return (
    Math.hypot(die.x - cup[0], die.z - cup[2]) <= tuning.cupProximityXZ &&
    Math.abs(die.y - cup[1]) <= tuning.cupProximityY
  );
}

function classifyPoseImpact(
  die: BodyMotion,
  motions: (BodyMotion | null)[],
  index: number,
  inCup: boolean,
  tuning: AudioTuning['pose'],
): SurfacePair {
  if (inCup) return 'die-cup';
  for (let j = 1; j < motions.length; j++) {
    if (j === index) continue;
    const other = motions[j];
    if (!other) continue;
    if (Math.hypot(die.x - other.x, die.y - other.y, die.z - other.z) <= tuning.dieProximity) {
      return 'die-die';
    }
  }
  if (die.y <= tuning.feltImpactYMax) {
    const radial = Math.hypot(die.x / FELT_BOUND_X, die.z / FELT_BOUND_Z);
    return radial >= tuning.railBoundFraction ? 'die-rail' : 'die-felt';
  }
  // Airborne deceleration with nothing nearby — most likely the rail/wall lip.
  return 'die-rail';
}
