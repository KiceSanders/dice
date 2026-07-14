# 002. Rapier physics stack for 3D dice

**Status:** accepted  
**Date:** 2026-07-03  
**Updated:** 2026-07-14

## Context

Phase 9+ needs believable dice rolls, cup pour, and table containment in the browser alongside React Three Fiber.

## Decision

- **Engine:** [Rapier](https://rapier.rs/) via [`@react-three/rapier`](https://github.com/pmndrs/react-three-rapier) (not Cannon.js / Ammo).
- **World:** [`TableCanvas.tsx`](../../client/src/table3d/TableCanvas.tsx) — **60 Hz** fixed timestep (production default), gravity from [`tuning.ts`](../../client/src/table3d/dice/tuning.ts). Playground Leva can still raise the rate for A/B.
- **Visual vs physics:** Meshes render outside `<Physics>`; colliders are explicit child components (`TableColliders`, `DieBody`, `KoozieBody`).
- **Dice:** Dynamic cuboid bodies with **soft CCD** prediction; light linear/angular damping; velocity clamps during settle **and** while the cup is held.
- **Koozie:** `gravityScale={0}`; kinematic while held/pouring; soft CCD prediction during that motion.
- **Tuning:** Live Leva panel in dev Playground persists to `localStorage` via [`tuning.ts`](../../client/src/table3d/dice/tuning.ts).

## Consequences

- Static table colliders use **trimesh** for curved surfaces; primitives where shapes are exact (die cuboid, cup bottom/lid cylinders).
- The koozie wall trimesh deliberately rides a **kinematic** body during drag. Held-phase velocities remain capped, and soft CCD supplies predictive contacts without hard-CCD shape casts. Dynamic dice remain primitive cuboids.
- Imperative body access must go through `liveBody()` guards in `DicePhysics.tsx` — removed WASM bodies panic if touched.

### Chromebook held-cup profiling

#### Symptom and evidence

On an M1 MacBook the interaction was smooth, but a hardware-accelerated Chromebook became persistently laggy after 15–20 seconds of dragging. One die in the cup was much better than multiple dice. The problem reproduced in `/dev/play`, so WebSocket latency was not in the loop, and it predated audio.

A 13.7-second Chrome trace recorded 492 dropped frames and animation callbacks as long as 721 ms. Rapier WASM used about 5.36 seconds of sampled CPU time versus 1.46 seconds in Three.js; paint/layout were negligible. Rapier's internal profiler (`World.profilerEnabled` plus the `timing*` methods after each physics step) then identified the stage precisely:

| Configuration | Steps | Steps >8 ms | Worst step | What dominated |
|---|---:|---:|---:|---|
| Original hard CCD (three dice in cup) | 1,480 | 128 | 121.3 ms | CCD TOI computation: 120.9 ms; normal collision/solver work ≈0.2 ms each |
| Discrete-only while held | 1,166 | 15 | 87.2 ms | Remaining hard-CCD TOI clusters when CCD returned; held drag was faster but behavior regressed |
| Final soft CCD | 2,670 | 1 | 11.2 ms | One ordinary collision-detection step; **0 ms CCD TOI** |

The multiple-die observation was real, but the normal contact solver was not blowing up: additional die pairs made hard CCD's nonlinear all-pairs TOI shape casts pathological on the Chromebook. `@react-three/rapier`'s fixed-step accumulator can amplify one slow step by attempting catch-up steps in the same animation frame, explaining the sustained lag after the first spike, but no custom accumulator/substep cap was needed once the TOI spike was removed.

Desktop headless benchmarks did not reproduce the Chromebook pathology: five dice increased normal contact work as expected, disabling CCD was only modestly faster, and compound-convex cup-wall experiments were slower than the existing 32-segment trimesh. This is why the Chromebook trace and Rapier stage timings—not desktop averages or collider simplification—drove the final change.

#### Final configuration and rationale

Hard nonlinear CCD is replaced with a one-die-width **soft CCD prediction distance** on dynamic dice and the moving cup. Soft CCD uses predictive contact constraints instead of TOI shape-casts/substeps, retaining anticipatory wall and die contacts without entering the profiled hot path. The prediction distance covers the maximum held cup/die relative travel in one 60 Hz step.

- [`SOFT_CCD_PREDICTION`](../../client/src/table3d/dice/constants.ts) is `DIE_SIZE` = **0.12** world units.
- Held relative linear travel is bounded by `(heldMaxLinVel 4 + maxPivotSpeed 2.4) / 60 = 0.107`, below the 0.12 prediction distance.
- [`DieBody`](../../client/src/table3d/dice/DieBody.tsx) keeps hard `ccd={false}` and applies soft prediction only to dynamic, unlocked/non-driven dice.
- [`KoozieBody`](../../client/src/table3d/dice/KoozieBody.tsx) keeps hard `ccd={false}` and applies soft prediction while it is kinematic (held/pouring).
- Dice remain dynamic. No collision groups, solver contacts, damping, cup motion, or audio behavior were removed.

The world remains at a fixed 60 Hz for stable, deterministic simulation behavior; 60 Hz is not considered the Chromebook performance fix.

Chromebook verification after the soft-CCD change recorded 2,670 Rapier steps with only one step over 8 ms (11.2 ms in ordinary collision detection) and zero time in CCD TOI computation. Dragging was reported playable with natural shaking restored. One rare die-wall penetration/stick was still observed; that is a contained follow-up geometry/prediction-tuning issue, not the former sustained CPU stall.

#### Attempts and rejected alternatives

- **120 → 60 Hz and held velocity clamps:** an earlier mitigation, not a fix. The Chromebook still became very laggy. Keep 60 Hz for behavior, but do not cite it as resolving this issue.
- **30 Hz:** made the koozie barely reactive and obscured rather than solved the cost; rejected.
- **Disable all prediction while held:** reduced CPU cost and confirmed the diagnosis, but dice mostly slid side-to-side and penetrated/stuck through the koozie wall; rejected.
- **Static/kinematically carried dice:** never acceptable—the dynamic slosh is required behavior and was not the expensive stage.
- **Simpler compound-convex cup wall:** slower in local benchmarks and did not target the measured TOI cause; rejected.
- **Audio/network/rendering changes:** ruled out by reproduction history, `/dev/play`, the hardware-acceleration report, and trace attribution; no such workaround shipped.
- **Custom fixed-step catch-up cap:** considered because catch-up amplified stalls, but not implemented; it would change simulation/interpolation behavior and became unnecessary after individual steps were made cheap.

#### Future tuning guardrails

The remaining rare die-wall stick is the next tuning target. Change one variable at a time and repeat a multi-die Chromebook run of at least 30 seconds plus a pour:

1. First try a small soft-prediction increase (for example 0.12 → 0.14), watching `timingBroadPhase`, `timingNarrowPhase`, natural tumbling, and wall penetration. Large prediction distances expand broad-phase work.
2. If prediction tuning is insufficient, inspect the inward-facing koozie trimesh and its inner wall/rim transitions before changing the visible cup or making dice non-dynamic.
3. If hard CCD is ever reconsidered, gate it as an explicit experiment and profile `timingCcdToiComputation`; do not restore it globally based only on a fast desktop result.
4. Do not lower the timestep, suppress die–die contacts, or make the dice static as a performance fix.
5. Preserve the measured baseline above in any follow-up ADR update so performance and behavior are evaluated together.

## See also

- [001 — Shared geometry for colliders](./001-shared-geometry-physics-colliders.md)
