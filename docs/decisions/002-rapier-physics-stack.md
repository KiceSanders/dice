# 002. Rapier physics stack for 3D dice

**Status:** accepted  
**Date:** 2026-07-03

## Context

Phase 9+ needs believable dice rolls, cup pour, and table containment in the browser alongside React Three Fiber.

## Decision

- **Engine:** [Rapier](https://rapier.rs/) via [`@react-three/rapier`](https://github.com/pmndrs/react-three-rapier) (not Cannon.js / Ammo).
- **World:** [`TableCanvas.tsx`](../../client/src/table3d/TableCanvas.tsx) — 120 Hz timestep, gravity from [`tuning.ts`](../../client/src/table3d/dice/tuning.ts).
- **Visual vs physics:** Meshes render outside `<Physics>`; colliders are explicit child components (`TableColliders`, `DieBody`, `KoozieBody`).
- **Dice:** Dynamic cuboid bodies + **CCD** when not locked/driven.
- **Koozie:** `gravityScale={0}`; kinematic while held/pouring; CCD during motion.
- **Tuning:** Live Leva panel in dev Playground persists to `localStorage` via [`tuning.ts`](../../client/src/table3d/dice/tuning.ts).

## Consequences

- Static table colliders use **trimesh** for curved surfaces; primitives where shapes are exact (die cuboid, cup bottom/lid cylinders).
- Rapier trimesh colliders are for **fixed** bodies only — appropriate for table/koozie walls, not dynamic dice.
- Imperative body access must go through `liveBody()` guards in `DicePhysics.tsx` — removed WASM bodies panic if touched.

## See also

- [001 — Shared geometry for colliders](./001-shared-geometry-physics-colliders.md)
