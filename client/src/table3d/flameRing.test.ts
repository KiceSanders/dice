import { describe, expect, it } from 'vitest';
import { cardTipY, FLAME_CARDS, FLAME_RING, flameCards, flameRingFramingPoints } from './flameRing';
import { FELT_SCALE, RAIL_OUTER_WORLD, TABLE } from './layout';
import { projectToNdc } from './project';

const APRON_OUTER = RAIL_OUTER_WORLD * FELT_SCALE.x;

function expectOnScreen(point: readonly [number, number, number]) {
  const ndc = projectToNdc(point);
  expect(Math.abs(ndc.x)).toBeLessThanOrEqual(1);
  expect(Math.abs(ndc.y)).toBeLessThanOrEqual(1);
  expect(ndc.z).toBeGreaterThan(0);
  expect(ndc.z).toBeLessThan(1);
}

describe('FLAME_RING placement', () => {
  it('hugs the table sides: just outside the apron wall, never floating away', () => {
    expect(FLAME_RING.radius).toBeGreaterThan(APRON_OUTER);
    expect(FLAME_RING.radius).toBeLessThanOrEqual(APRON_OUTER + 0.15);
  });

  it('starts under the table and licks past the rail rim', () => {
    // Apron bottom is surfaceY − 0.35 (PokerTableMesh APRON_DROP).
    expect(FLAME_RING.baseY).toBeLessThan(TABLE.surfaceY - 0.35);
    expect(FLAME_RING.topY).toBeGreaterThan(TABLE.surfaceY + TABLE.railHeight);
  });

  it('keeps every extreme ring point inside the 16:9 frame', () => {
    for (const point of flameRingFramingPoints()) {
      expectOnScreen(point);
    }
  });
});

describe('flameCards', () => {
  it('is deterministic', () => {
    expect(flameCards()).toEqual(flameCards());
  });

  it('places every card just outside the apron wall, rooted under the table', () => {
    for (const card of flameCards()) {
      const radius = Math.hypot(card.x, card.z);
      expect(radius).toBeGreaterThan(APRON_OUTER);
      expect(radius).toBeLessThanOrEqual(APRON_OUTER + 0.25);
    }
    // Apron bottom is surfaceY − 0.35 (PokerTableMesh APRON_DROP).
    expect(FLAME_CARDS.baseY).toBeLessThan(TABLE.surfaceY - 0.35);
  });

  it('licks well past the rail rim but never above the per-angle tip bound', () => {
    const cards = flameCards();
    const tallest = Math.max(...cards.map((c) => FLAME_CARDS.baseY + c.height));
    expect(tallest).toBeGreaterThan(TABLE.surfaceY + TABLE.railHeight + 0.3);
    for (const card of cards) {
      const radius = Math.hypot(card.x, card.z);
      expect(FLAME_CARDS.baseY + card.height).toBeLessThanOrEqual(cardTipY(card.z, radius));
    }
  });

  it('keeps every card fully inside the 16:9 frame — tips, roots, and side edges', () => {
    for (const card of flameCards()) {
      const tipY = FLAME_CARDS.baseY + card.height;
      // Card local +X after the facing yaw maps to world (cos yaw, 0, −sin yaw).
      const edgeX = Math.cos(card.yaw) * (card.width / 2);
      const edgeZ = -Math.sin(card.yaw) * (card.width / 2);
      expectOnScreen([card.x, tipY, card.z]);
      expectOnScreen([card.x, FLAME_CARDS.baseY, card.z]);
      expectOnScreen([card.x + edgeX, tipY, card.z + edgeZ]);
      expectOnScreen([card.x - edgeX, tipY, card.z - edgeZ]);
    }
  });
});
