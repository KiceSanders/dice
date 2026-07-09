# 002. Rapier physics stack for 3D dice

**Status:** accepted  
**Date:** 2026-07-03  
**Updated:** 2026-07-09

## Context

Phase 9+ needs believable dice rolls, cup pour, and table containment in the browser alongside React Three Fiber.

## Decision

- **Engine:** [Rapier](https://rapier.rs/) via [`@react-three/rapier`](https://github.com/pmndrs/react-three-rapier) (not Cannon.js / Ammo).
- **World:** [`TableCanvas.tsx`](../../client/src/table3d/TableCanvas.tsx) — **60 Hz** fixed timestep (production default), gravity from [`tuning.ts`](../../client/src/table3d/dice/tuning.ts). Playground Leva can still raise the rate for A/B.
- **Visual vs physics:** Meshes render outside `<Physics>`; colliders are explicit child components (`TableColliders`, `DieBody`, `KoozieBody`).
- **Dice:** Dynamic cuboid bodies + **CCD** when not locked/driven; light linear/angular damping; velocity clamps during settle **and** while the cup is held.
- **Koozie:** `gravityScale={0}`; kinematic while held/pouring; CCD during motion.
- **Tuning:** Live Leva panel in dev Playground persists to `localStorage` via [`tuning.ts`](../../client/src/table3d/dice/tuning.ts).

## Consequences

- Static table colliders use **trimesh** for curved surfaces; primitives where shapes are exact (die cuboid, cup bottom/lid cylinders).
- Rapier trimesh colliders are for **fixed** bodies only — appropriate for table/koozie walls, not dynamic dice. The koozie wall trimesh still rides a **kinematic** body during drag; held-phase velocity clamps and a 60 Hz step limit the catch-up / impulse spiral that showed up on Chromebook-class hardware at 120 Hz.
- Imperative body access must go through `liveBody()` guards in `DicePhysics.tsx` — removed WASM bodies panic if touched.

### Why 60 Hz (not 120)

`@react-three/rapier` uses a fixed-timestep accumulator. At 120 Hz, a laggy 50–100 ms frame runs many physics substeps in one rAF against a moving kinematic trimesh cup and five undamped dice — both expensive and unstable. Halving the rate roughly halves catch-up work on the same frame time; fidelity for five dice in a cup remains acceptable. Prefer lowering the step rate and capping in-cup energy before simplifying colliders.

## See also

- [001 — Shared geometry for colliders](./001-shared-geometry-physics-colliders.md)
