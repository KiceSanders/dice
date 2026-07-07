import { DIE_HALF, KOOZIE } from './constants';
import { koozieBottomColliderY, koozieLidColliderY } from './koozieGeometry';
import type { DicePhysicsTuning } from './tuning';

type CupTuning = DicePhysicsTuning['cup'];

/** Matches DieBody cuboid collider half-extent. */
const DIE_COLLIDER_HALF = DIE_HALF * 0.96;
/** Horizontal corner reach of a FLAT (yaw-only rotated) die. */
const DIE_FLAT_CORNER = DIE_COLLIDER_HALF * Math.SQRT2;
const SPAWN_MARGIN = 0.005;
/** Dice per spawn layer — three fit at 120° inside the default cup interior. */
const DICE_PER_LAYER = 3;

function cupDefaults(): CupTuning {
  return {
    radius: KOOZIE.radius,
    height: KOOZIE.height,
    wallThickness: KOOZIE.wallThickness,
    bottomThickness: KOOZIE.bottomThickness,
    rimInset: KOOZIE.rimInset,
    lidThickness: 0.02,
    friction: KOOZIE.friction,
    restitution: KOOZIE.restitution,
    density: KOOZIE.density,
    floatCenterY: KOOZIE.floatCenterY,
    hitRadius: KOOZIE.hitRadius,
    hitScreenPx: KOOZIE.hitScreenPx,
    emptyCheckRadius: KOOZIE.emptyCheckRadius,
  };
}

function pseudoRandom(index: number, salt: number): number {
  return (((index + 1) * 7919 + salt * 104729) % 1000) / 1000;
}

/**
 * Derived layout for dice spawned inside the cup. Dice spawn FLAT (yaw-only
 * rotation) in rings of DICE_PER_LAYER: the cup interior is too small for
 * freely rotated dice to coexist without intersecting, and intersecting
 * dynamic bodies get depenetration-ejected through the lid on wake (the
 * "die lands on top of the koozie" bug). Flat packing fits provably —
 * koozieColliders.test.ts asserts pairwise non-overlap and interior fit.
 */
export function cupDieSpawnLayout(cup: CupTuning = cupDefaults()): {
  ringRadius: number;
  firstLayerY: number;
  layerPitch: number;
  flatHalf: number;
  flatCorner: number;
  innerRadius: number;
  lidBottomY: number;
  floorTopY: number;
} {
  const innerRadius = cup.radius - cup.wallThickness;
  const rMax = innerRadius - DIE_FLAT_CORNER - SPAWN_MARGIN;
  // Ring radius: same-layer neighbours sit 2·ringR·sin(π/n) apart and must
  // clear each other's worst-case yaw diagonals; center in the slack above
  // that minimum so both the wall and the neighbours keep margin.
  const rNeeded = (2 * DIE_FLAT_CORNER + SPAWN_MARGIN) / (2 * Math.sin(Math.PI / DICE_PER_LAYER));
  const ringRadius = Math.min(rMax, (rNeeded + rMax) / 2);
  const floorTopY = koozieBottomColliderY(cup) + cup.bottomThickness * 0.5;
  const firstLayerY = floorTopY + DIE_COLLIDER_HALF + SPAWN_MARGIN;
  const layerPitch = DIE_COLLIDER_HALF * 2 + SPAWN_MARGIN;
  const lidBottomY = koozieLidColliderY(cup) - cup.lidThickness * 0.5;
  return {
    ringRadius,
    firstLayerY,
    layerPitch,
    flatHalf: DIE_COLLIDER_HALF,
    flatCorner: DIE_FLAT_CORNER,
    innerRadius,
    lidBottomY,
    floorTopY,
  };
}

/**
 * Stable local-space spawn pose for a die inside the cup interior. Positions
 * depend only on the die's slot index (not the total), so dice keep their
 * spots as the unkept count changes between rolls.
 */
export function spawnDiceInCupLocal(
  index: number,
  _total: number,
  cup: CupTuning = cupDefaults(),
): { position: [number, number, number]; rotation: [number, number, number] } {
  const { ringRadius, firstLayerY, layerPitch } = cupDieSpawnLayout(cup);
  const layer = Math.floor(index / DICE_PER_LAYER);
  const slot = index % DICE_PER_LAYER;
  // Alternate layers are rotated half a slot so stacks don't visually align.
  const angle = (slot / DICE_PER_LAYER) * Math.PI * 2 + layer * (Math.PI / DICE_PER_LAYER);
  return {
    position: [
      Math.cos(angle) * ringRadius,
      firstLayerY + layer * layerPitch,
      Math.sin(angle) * ringRadius,
    ],
    rotation: [0, pseudoRandom(index, 4) * Math.PI * 2, 0],
  };
}

/** Cup-local Y of the open rim (top). */
export function cupRimLocalY(cup: CupTuning = cupDefaults()): number {
  return cup.height * 0.5 - cup.rimInset;
}
