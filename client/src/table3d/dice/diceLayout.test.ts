import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { KOOZIE, FELT_BOUND_X, FELT_BOUND_Z } from './constants';
import {
  KEPT_DIE_SPACING,
  keepSlotForIndex,
  keptDieRailPosition,
  koozieRestPosition,
} from './diceLayout';
import { SEAT_VIEW } from '../layout';

/** Project a world point through the fixed seat camera → NDC. */
function projectToNdc(point: [number, number, number]): THREE.Vector3 {
  const camera = new THREE.PerspectiveCamera(SEAT_VIEW.fov, 16 / 9, 0.1, 30);
  camera.position.set(...SEAT_VIEW.position);
  camera.lookAt(...SEAT_VIEW.target);
  camera.updateMatrixWorld();
  return new THREE.Vector3(...point).project(camera);
}

function expectOnScreen(point: [number, number, number], label: string) {
  const ndc = projectToNdc(point);
  expect(Math.abs(ndc.x), `${label} ndc.x`).toBeLessThanOrEqual(1);
  expect(Math.abs(ndc.y), `${label} ndc.y`).toBeLessThanOrEqual(1);
  expect(ndc.z, `${label} ndc.z`).toBeLessThan(1);
}

/** Same ellipse test DicePhysics uses to decide "click teleports the cup in". */
function isOutsidePlayBounds(x: number, z: number, cupRadius: number): boolean {
  const margin = cupRadius + 0.16;
  const a = Math.max(FELT_BOUND_X - margin, 0.1);
  const b = Math.max(FELT_BOUND_Z - margin, 0.1);
  return Math.hypot(x / a, z / b) > 1;
}

describe('diceLayout', () => {
  const rest = koozieRestPosition(KOOZIE);

  it('koozie rests across the table from the roller (−Z), on the felt', () => {
    expect(rest[0]).toBeCloseTo(0, 3);
    expect(rest[1]).toBeCloseTo(KOOZIE.height / 2, 3);
    expect(rest[2]).toBeLessThan(-1.4);
  });

  it('koozie rest is outside the play bounds so a click teleports it in', () => {
    expect(isOutsidePlayBounds(rest[0], rest[2], KOOZIE.radius)).toBe(true);
  });

  it('keptDieRailPosition centers a row on the near rail toward the roller', () => {
    const count = 3;
    const positions = Array.from({ length: count }, (_, slot) => keptDieRailPosition(slot, count));
    expect(positions[0]![0]).toBeCloseTo(-KEPT_DIE_SPACING, 2);
    expect(positions[1]![0]).toBeCloseTo(0, 2);
    expect(positions[2]![0]).toBeCloseTo(KEPT_DIE_SPACING, 2);
    for (const pos of positions) {
      expect(pos[2]).toBeGreaterThan(1.5);
    }
  });

  it('keepSlotForIndex maps die index to tray slot', () => {
    expect(keepSlotForIndex(2, [1, 2, 4])).toBe(1);
    expect(keepSlotForIndex(0, [1, 2, 4])).toBe(-1);
  });
});

describe('table framing (fixed SEAT_VIEW camera)', () => {
  it('the whole resting koozie is inside the camera frame', () => {
    const [x, y, z] = koozieRestPosition(KOOZIE);
    expectOnScreen([x, y, z], 'cup center');
    expectOnScreen([x, y + KOOZIE.height / 2, z], 'cup top rim');
    expectOnScreen([x, y - KOOZIE.height / 2, z], 'cup bottom');
    expectOnScreen([x - KOOZIE.radius, y, z], 'cup left edge');
    expectOnScreen([x + KOOZIE.radius, y, z], 'cup right edge');
  });

  it('a full kept-dice row on the near rail is inside the camera frame', () => {
    for (let slot = 0; slot < 5; slot++) {
      const pos = keptDieRailPosition(slot, 5);
      expectOnScreen(pos, `kept die slot ${slot}`);
    }
  });
});
