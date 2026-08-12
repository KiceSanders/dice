import { readTopFaceFromQuat } from '@dice/shared';
import { describe, expect, it } from 'vitest';
import { DICE_COUNT } from './constants';
import { cupLocalToWorld, eulerToQuat } from './diceRuntime';
import { cupDieSpawnLayout, randomCupDieRotation, spawnDiceInCupLocal } from './koozieColliders';
import { createHomePose, isInsideCup } from './koozieMotion';
import { DEFAULT_DICE_PHYSICS_TUNING } from './tuning';

const CUP = DEFAULT_DICE_PHYSICS_TUNING.cup;
const LAYOUT = cupDieSpawnLayout(CUP);
const EPS = 1e-9;

describe('cupDieSpawnLayout', () => {
  it('a full hand fits between the cup floor and the lid', () => {
    const topLayer = Math.floor((DICE_COUNT - 1) / 3);
    const highestDieTop = LAYOUT.firstLayerY + topLayer * LAYOUT.layerPitch + LAYOUT.flatHalf;
    expect(highestDieTop).toBeLessThan(LAYOUT.lidBottomY);
    expect(LAYOUT.firstLayerY - LAYOUT.flatHalf).toBeGreaterThanOrEqual(LAYOUT.floorTopY);
  });

  it('flat die corners on the ring stay inside the wall cylinder', () => {
    expect(LAYOUT.ringRadius + LAYOUT.flatCorner).toBeLessThan(LAYOUT.innerRadius);
  });
});

describe('spawnDiceInCupLocal', () => {
  it('no two spawned dice can intersect, for any hand size and any yaw', () => {
    // Intersecting dynamic bodies get depenetration-ejected on wake — the
    // "die lands on top of the koozie" bug. Flat (yaw-only) dice cannot
    // intersect when either their vertical gap exceeds the die height or
    // their horizontal gap exceeds the worst-case yaw diagonal.
    for (let total = 2; total <= DICE_COUNT; total++) {
      for (let a = 0; a < total; a++) {
        for (let b = a + 1; b < total; b++) {
          const pa = spawnDiceInCupLocal(a, total, CUP).position;
          const pb = spawnDiceInCupLocal(b, total, CUP).position;
          const verticalGap = Math.abs(pa[1] - pb[1]);
          const horizontalGap = Math.hypot(pa[0] - pb[0], pa[2] - pb[2]);
          const separated =
            verticalGap >= LAYOUT.flatHalf * 2 - EPS ||
            horizontalGap >= LAYOUT.flatCorner * 2 - EPS;
          expect(separated, `dice ${a} & ${b} of ${total} overlap`).toBe(true);
        }
      }
    }
  });

  it('spawns axis-aligned dice with corners inside floor, lid, and wall', () => {
    let seed = 1;
    const rng = () => {
      seed = (seed * 48271) % 0x7fffffff;
      return seed / 0x7fffffff;
    };
    for (let index = 0; index < DICE_COUNT; index++) {
      const { position, rotation } = spawnDiceInCupLocal(index, DICE_COUNT, CUP, rng);
      // Quarter-turn XYZ only — must stay flat after euler→quat (packing AABB).
      for (const component of rotation) {
        const turns = component / (Math.PI / 2);
        expect(Math.abs(turns - Math.round(turns))).toBeLessThan(1e-9);
      }
      const q = eulerToQuat(rotation);
      for (const component of [q.x, q.y, q.z, q.w]) {
        const abs = Math.abs(component);
        const nearest = [0, 0.5, Math.SQRT1_2, 1].reduce((best, candidate) =>
          Math.abs(abs - candidate) < Math.abs(abs - best) ? candidate : best,
        );
        expect(Math.abs(abs - nearest)).toBeLessThan(1e-6);
      }
      const [x, y, z] = position;
      expect(y - LAYOUT.flatHalf).toBeGreaterThanOrEqual(LAYOUT.floorTopY - EPS);
      expect(y + LAYOUT.flatHalf).toBeLessThanOrEqual(LAYOUT.lidBottomY + EPS);
      expect(Math.hypot(x, z) + LAYOUT.flatCorner).toBeLessThanOrEqual(LAYOUT.innerRadius + EPS);
    }
  });

  it('randomCupDieRotation varies the up-face across seeds', () => {
    const faces = new Set<number>();
    for (let i = 0; i < 96; i++) {
      let n = i + 1;
      const rng = () => {
        n = (n * 1103515245 + 12345) % 0x80000000;
        return n / 0x80000000;
      };
      const q = eulerToQuat(randomCupDieRotation(rng));
      faces.add(readTopFaceFromQuat([q.x, q.y, q.z, q.w]));
    }
    expect(faces.size).toBe(6);
  });

  it('positions depend only on the slot index, not the hand size', () => {
    for (let index = 0; index < 3; index++) {
      expect(spawnDiceInCupLocal(index, 3, CUP).position).toEqual(
        spawnDiceInCupLocal(index, DICE_COUNT, CUP).position,
      );
    }
  });

  it('transformed spawn centers pass isInsideCup at dock and float poses', () => {
    const home = createHomePose(DEFAULT_DICE_PHYSICS_TUNING);
    const floatPose = { x: 0, y: CUP.floatCenterY, z: 0.4 };
    const identityRot = { x: 0, y: 0, z: 0, w: 1 };

    for (let index = 0; index < DICE_COUNT; index++) {
      const { position } = spawnDiceInCupLocal(index, DICE_COUNT, CUP);
      const dockWorld = cupLocalToWorld(position, home.position, home.quaternion);
      expect(
        isInsideCup(
          { x: dockWorld[0], y: dockWorld[1], z: dockWorld[2] },
          { x: home.position.x, y: home.position.y, z: home.position.z },
          {
            x: home.quaternion.x,
            y: home.quaternion.y,
            z: home.quaternion.z,
            w: home.quaternion.w,
          },
          DEFAULT_DICE_PHYSICS_TUNING,
        ),
      ).toBe(true);

      const worldAtFloat: [number, number, number] = [
        floatPose.x + position[0],
        floatPose.y + position[1],
        floatPose.z + position[2],
      ];
      expect(
        isInsideCup(
          { x: worldAtFloat[0], y: worldAtFloat[1], z: worldAtFloat[2] },
          floatPose,
          identityRot,
          DEFAULT_DICE_PHYSICS_TUNING,
        ),
      ).toBe(true);
    }
  });
});
