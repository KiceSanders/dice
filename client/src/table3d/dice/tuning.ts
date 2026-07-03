import { useSyncExternalStore } from 'react';
import { DICE_FELT_Y, KOOZIE, PHYSICS } from './constants';

export interface DicePhysicsTuning {
  world: {
    gravityY: number;
    timeStep: number;
    timeScale: number;
    debug: boolean;
  };
  dice: {
    friction: number;
    restitution: number;
    density: number;
    linearDamping: number;
    angularDamping: number;
    maxLinVel: number;
    maxAngVel: number;
  };
  table: {
    friction: number;
    restitution: number;
    railFriction: number;
    railRestitution: number;
    wallFriction: number;
    wallRestitution: number;
    ceilingY: number;
  };
  cup: {
    radius: number;
    height: number;
    wallThickness: number;
    bottomThickness: number;
    rimInset: number;
    lidThickness: number;
    friction: number;
    restitution: number;
    density: number;
    floatCenterY: number;
    homeZ: number;
    hitRadius: number;
    hitScreenPx: number;
    emptyCheckRadius: number;
  };
  pendulum: {
    follow: number;
    velocitySmooth: number;
    accelerationSmooth: number;
    length: number;
    dampingRatio: number;
    maxTilt: number;
    maxPivotSpeed: number;
  };
  release: {
    tipAngle: number;
    tipDurationMs: number;
    pourCenterY: number;
    glideVelocityScale: number;
    glideMaxDistance: number;
    glideDecay: number;
    velocityBlend: number;
    speedThreshold: number;
    downBias: number;
  };
  settle: {
    linearVelocity: number;
    angularVelocity: number;
    frames: number;
    timeoutMs: number;
    fallThroughY: number;
  };
}

type Listener = () => void;

export type DicePhysicsTuningPatch = {
  [K in keyof DicePhysicsTuning]?: Partial<DicePhysicsTuning[K]>;
};

const DEFAULT_CUP_FLOAT_Y = DICE_FELT_Y + 0.72;

export const DEFAULT_DICE_PHYSICS_TUNING: DicePhysicsTuning = {
  world: {
    gravityY: PHYSICS.gravity[1],
    timeStep: 1 / 120,
    timeScale: 1,
    debug: false,
  },
  dice: {
    friction: PHYSICS.dieFriction,
    restitution: PHYSICS.dieRestitution,
    density: PHYSICS.dieDensity,
    linearDamping: PHYSICS.linearDamping,
    angularDamping: PHYSICS.angularDamping,
    maxLinVel: PHYSICS.maxLinVel,
    maxAngVel: PHYSICS.maxAngVel,
  },
  table: {
    friction: PHYSICS.tableFriction,
    restitution: PHYSICS.tableRestitution,
    railFriction: PHYSICS.railFriction,
    railRestitution: PHYSICS.railRestitution,
    wallFriction: PHYSICS.wallFriction,
    wallRestitution: PHYSICS.wallRestitution,
    ceilingY: 1.45,
  },
  cup: {
    radius: KOOZIE.radius,
    height: KOOZIE.height,
    wallThickness: KOOZIE.wallThickness,
    bottomThickness: KOOZIE.bottomThickness,
    rimInset: KOOZIE.rimInset,
    lidThickness: 0.02,
    friction: KOOZIE.friction,
    restitution: KOOZIE.restitution,
    density: KOOZIE.density,
    floatCenterY: DEFAULT_CUP_FLOAT_Y,
    homeZ: KOOZIE.home[2],
    hitRadius: KOOZIE.hitRadius,
    hitScreenPx: KOOZIE.hitScreenPx,
    emptyCheckRadius: KOOZIE.emptyCheckRadius,
  },
  pendulum: {
    follow: 57,
    velocitySmooth: 18,
    accelerationSmooth: 12,
    length: 0.42,
    dampingRatio: 0.72,
    maxTilt: 0.56,
    maxPivotSpeed: 3.2,
  },
  release: {
    tipAngle: 3.05,
    tipDurationMs: 360,
    pourCenterY: 0.463,
    glideVelocityScale: 0.8,
    glideMaxDistance: 0.67,
    glideDecay: 4.5,
    velocityBlend: 0.35,
    speedThreshold: 0.22,
    downBias: 0.35,
  },
  settle: {
    linearVelocity: PHYSICS.settleLinVel,
    angularVelocity: PHYSICS.settleAngVel,
    frames: PHYSICS.settleFrames,
    timeoutMs: 10_000,
    fallThroughY: -0.45,
  },
};

let currentTuning: DicePhysicsTuning = cloneTuning(DEFAULT_DICE_PHYSICS_TUNING);
const listeners = new Set<Listener>();

function cloneTuning(tuning: DicePhysicsTuning): DicePhysicsTuning {
  return {
    world: { ...tuning.world },
    dice: { ...tuning.dice },
    table: { ...tuning.table },
    cup: { ...tuning.cup },
    pendulum: { ...tuning.pendulum },
    release: { ...tuning.release },
    settle: { ...tuning.settle },
  };
}

function emit() {
  for (const listener of listeners) listener();
}

export function getDicePhysicsTuning(): DicePhysicsTuning {
  return currentTuning;
}

export function setDicePhysicsTuning(next: DicePhysicsTuning) {
  currentTuning = cloneTuning(next);
  emit();
}

export function updateDicePhysicsTuning(patch: DicePhysicsTuningPatch) {
  currentTuning = {
    world: { ...currentTuning.world, ...patch.world },
    dice: { ...currentTuning.dice, ...patch.dice },
    table: { ...currentTuning.table, ...patch.table },
    cup: { ...currentTuning.cup, ...patch.cup },
    pendulum: { ...currentTuning.pendulum, ...patch.pendulum },
    release: { ...currentTuning.release, ...patch.release },
    settle: { ...currentTuning.settle, ...patch.settle },
  };
  emit();
}

export function resetDicePhysicsTuning() {
  setDicePhysicsTuning(DEFAULT_DICE_PHYSICS_TUNING);
}

export function subscribeDicePhysicsTuning(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useDicePhysicsTuning(): DicePhysicsTuning {
  return useSyncExternalStore(
    subscribeDicePhysicsTuning,
    getDicePhysicsTuning,
    () => DEFAULT_DICE_PHYSICS_TUNING,
  );
}

const PRESET_KEY = 'dice:physics-presets';
const LIVE_KEY = 'dice:physics-live';

/** Persist the current tuning so a page refresh doesn't lose in-progress tweaks. */
export function persistLiveTuning() {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(LIVE_KEY, JSON.stringify(currentTuning));
  } catch {
    // storage may be unavailable (private mode, quota) — live tuning still works in-memory
  }
}

/**
 * Restore the last live tuning from storage into the store.
 * Values are merged over defaults so stale/missing keys fall back safely.
 * Returns the restored tuning, or null when nothing was stored.
 */
export function restoreLiveTuning(): DicePhysicsTuning | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(LIVE_KEY);
    if (!raw) return null;
    const stored = JSON.parse(raw) as DicePhysicsTuningPatch;
    currentTuning = {
      world: { ...DEFAULT_DICE_PHYSICS_TUNING.world, ...stored.world },
      dice: { ...DEFAULT_DICE_PHYSICS_TUNING.dice, ...stored.dice },
      table: { ...DEFAULT_DICE_PHYSICS_TUNING.table, ...stored.table },
      cup: { ...DEFAULT_DICE_PHYSICS_TUNING.cup, ...stored.cup },
      pendulum: { ...DEFAULT_DICE_PHYSICS_TUNING.pendulum, ...stored.pendulum },
      release: { ...DEFAULT_DICE_PHYSICS_TUNING.release, ...stored.release },
      settle: { ...DEFAULT_DICE_PHYSICS_TUNING.settle, ...stored.settle },
    };
    emit();
    return currentTuning;
  } catch {
    return null;
  }
}

export function clearLiveTuning() {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(LIVE_KEY);
  } catch {
    // ignore
  }
}

export function loadTuningPresets(): Record<string, DicePhysicsTuning> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(PRESET_KEY);
    return raw ? (JSON.parse(raw) as Record<string, DicePhysicsTuning>) : {};
  } catch {
    return {};
  }
}

export function saveTuningPreset(name: string, tuning = currentTuning) {
  if (typeof window === 'undefined') return;
  const cleanName = name.trim() || 'untitled';
  const presets = loadTuningPresets();
  presets[cleanName] = cloneTuning(tuning);
  window.localStorage.setItem(PRESET_KEY, JSON.stringify(presets));
}

export function readTuningPreset(name: string): DicePhysicsTuning | null {
  const preset = loadTuningPresets()[name.trim()];
  return preset ? cloneTuning(preset) : null;
}
