import { KOOZIE } from './constants';
import type { DicePhysicsTuning } from './tuning';

type CupTuning = DicePhysicsTuning['cup'];

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
    homeZ: KOOZIE.home[2],
    hitRadius: KOOZIE.hitRadius,
    hitScreenPx: KOOZIE.hitScreenPx,
    emptyCheckRadius: KOOZIE.emptyCheckRadius,
  };
}

function pseudoRandom(index: number, salt: number): number {
  return (((index + 1) * 7919 + salt * 104729) % 1000) / 1000;
}

/** Stable local-space spawn pose for a die inside the cup interior. */
export function spawnDiceInCupLocal(
  index: number,
  total: number,
  cup: CupTuning = cupDefaults(),
): { position: [number, number, number]; rotation: [number, number, number] } {
  const { height, radius, bottomThickness, rimInset } = cup;
  const innerR = radius - cup.wallThickness - 0.025;
  const yMin = -height * 0.5 + bottomThickness + 0.06;
  const yMax = height * 0.5 - rimInset - 0.06;
  const angle = (index / Math.max(total, 1)) * Math.PI * 2 + pseudoRandom(index, 1) * 0.6;
  const r = innerR * (0.35 + pseudoRandom(index, 2) * 0.45);
  const y = yMin + (yMax - yMin) * pseudoRandom(index, 3);
  return {
    position: [Math.cos(angle) * r, y, Math.sin(angle) * r],
    rotation: [
      pseudoRandom(index, 4) * Math.PI * 2,
      pseudoRandom(index, 5) * Math.PI * 2,
      pseudoRandom(index, 6) * Math.PI * 2,
    ],
  };
}

/** Cup-local Y of the open rim (top). */
export function cupRimLocalY(cup: CupTuning = cupDefaults()): number {
  return cup.height * 0.5 - cup.rimInset;
}
