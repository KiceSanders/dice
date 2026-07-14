import { DICE_FELT_Y, DIE_SIZE, KOOZIE } from '../dice/constants';

/**
 * Which two surfaces met. Every impact sound decision (threshold, sample,
 * volume curve) is keyed by this — classification happens via collider
 * `name` props on the roller (see impactRules.ts) and via pose geometry for
 * spectators (see poseImpacts.ts).
 */
export type SurfacePair = 'die-die' | 'die-felt' | 'die-rail' | 'die-wall' | 'die-cup' | 'die-lid';

export interface AudioTuning {
  pan: {
    /** Stereo width: worldX at the felt edge maps to ±width. */
    width: number;
  };
  impact: {
    /**
     * Contact forces below this are inaudible (rest contacts, micro-jitter).
     * Units are rapier force magnitudes; a die here weighs ~0.03 in those
     * units and a 2 m/s landing peaks around 0.5–1. Recalibrate with the
     * `dice:audio-debug` localStorage flag (see rollerImpacts.ts).
     */
    minForce: Record<SurfacePair, number>;
    /** Force that maps to full intensity (gain curve tops out here). */
    refForce: Record<SurfacePair, number>;
    /** A pair silent for this long re-arms its rising edge. */
    risingEdgeStaleMs: number;
    /** Min gap between plays of the same collider pair. */
    pairCooldownMs: number;
    /** Global rate cap: at most maxStarts plays per startWindowMs. */
    maxStarts: number;
    startWindowMs: number;
    /** Engine-side cap on simultaneously sounding one-shots. */
    maxVoices: number;
    /** Random playback-rate spread (±) applied per play. */
    pitchJitter: number;
  };
  rattle: {
    /** Exponential decay rate of the rattle level per second. */
    decayPerSec: number;
    /** Contact-force magnitude → level increment scale (roller side). */
    forceScale: number;
    /**
     * Forces at or below this never feed the rattle. Dice RESTING on the cup
     * bottom report their weight (~0.03 each) every physics step — without
     * this floor a motionless held cup rattles forever.
     */
    feedMinForce: number;
    /** die-cup forces above this also play a discrete clack tick. */
    tickThreshold: number;
    /** Loop gain when the rattle level is at 1. */
    loopGainMax: number;
    /** Levels below this are forced to silence (kills sub-audible droning). */
    minAudibleLevel: number;
  };
  pose: {
    /**
     * Frames spaced wider than this (ms) carry no impact detection — the
     * stream drops to slow sampling during the selecting phase, where kept
     * dice teleport to the rail and would read as phantom hits.
     */
    maxFrameGapMs: number;
    /**
     * Displacement implying speed above this (m/s) is a teleport, not
     * motion — real dice are velocity-clamped well below it. Resets that
     * die's history instead of sounding.
     */
    maxPlausibleSpeed: number;
    /** Ignore impacts unless the die moved at least this fast (m/s). */
    minImpactSpeed: number;
    /** Speed drop between consecutive frames that reads as an impact. */
    minDecel: number;
    /** Downward vy that arms the fall→land detector. */
    minFallSpeed: number;
    /** Die centers below this height classify as felt hits. */
    feltImpactYMax: number;
    /** Beyond this fraction of the felt bound, a low hit is the rail. */
    railBoundFraction: number;
    /** Two die centers closer than this classify as die-die. */
    dieProximity: number;
    /** Horizontal / vertical distance from the cup center that counts as in-cup. */
    cupProximityXZ: number;
    cupProximityY: number;
    /** Pre-impact speed that maps to full intensity. */
    refSpeed: number;
    /** Mean in-cup die speed that maps to shake level 1. */
    shakeSpeedFull: number;
    /** Keep only the strongest N impacts per streamed frame. */
    maxImpactsPerFrame: number;
  };
  settings: {
    defaultVolume: number;
  };
}

export const AUDIO_TUNING: AudioTuning = {
  pan: { width: 0.6 },
  impact: {
    minForce: {
      'die-die': 0.08,
      'die-felt': 0.12,
      'die-rail': 0.12,
      'die-wall': 0.12,
      'die-cup': 0.1,
      'die-lid': 0.1,
    },
    refForce: {
      'die-die': 0.7,
      'die-felt': 0.9,
      'die-rail': 0.9,
      'die-wall': 0.9,
      'die-cup': 0.8,
      'die-lid': 0.8,
    },
    risingEdgeStaleMs: 120,
    pairCooldownMs: 70,
    maxStarts: 4,
    startWindowMs: 60,
    maxVoices: 8,
    pitchJitter: 0.12,
  },
  rattle: {
    decayPerSec: 3,
    forceScale: 0.6,
    // ~3× one die's resting weight — rest contacts stay silent, shakes pass.
    feedMinForce: 0.1,
    tickThreshold: 0.5,
    loopGainMax: 0.55,
    minAudibleLevel: 0.05,
  },
  pose: {
    maxFrameGapMs: 120,
    // Live dice are clamped to 8 m/s (PHYSICS.maxLinVel); above this = teleport.
    maxPlausibleSpeed: 9,
    minImpactSpeed: 0.5,
    minDecel: 0.6,
    minFallSpeed: 0.35,
    feltImpactYMax: DICE_FELT_Y + 0.06,
    railBoundFraction: 0.85,
    dieProximity: DIE_SIZE * 1.3,
    cupProximityXZ: KOOZIE.radius * 1.6,
    cupProximityY: KOOZIE.height * 1.25,
    refSpeed: 2.5,
    shakeSpeedFull: 1.5,
    maxImpactsPerFrame: 3,
  },
  settings: {
    defaultVolume: 0.8,
  },
};
