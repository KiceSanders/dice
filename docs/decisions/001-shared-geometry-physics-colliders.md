# 001. Shared geometry for table and koozie physics colliders

**Status:** accepted  
**Date:** 2026-07-03

## Context

The 3D table and koozie originally used **physics colliders decoupled from visual meshes**:

- Table felt was an axis-aligned **box** while the mesh is an **ellipse**.
- Table rail and outer wall used **40 radial cuboid segments** each (“pylons” in Rapier debug).
- Koozie walls used **12 cuboid segments** around a cylinder visual.

That caused dice to escape through segment gaps, clip through the felt at oval extremes (especially left/right), and drift whenever art constants changed without updating colliders.

## Decision

Use **Option B: shared layout constants + procedural geometry builders** — not literal render meshes as colliders.

### Table ([`client/src/table3d/tableGeometry.ts`](../../client/src/table3d/tableGeometry.ts))

| Part | Collider | Builder |
|------|----------|---------|
| Felt | Elliptical disc **trimesh** | `createFeltColliderGeometry()` via `feltEllipsePoint()` |
| Rail | Extruded oval ring **trimesh** | `createRailColliderGeometry()` |
| Outer wall | Extruded oval ring **trimesh** | `createWallColliderGeometry()` |
| Ceiling | Thin **cuboid** (unchanged) | inline in `TableColliders` |

Visuals in [`PokerTableMesh.tsx`](../../client/src/table3d/PokerTableMesh.tsx) consume the same module for circle/ring geometry. Layout constants live in [`layout.ts`](../../client/src/table3d/layout.ts).

**Felt note:** We initially used a scaled `CylinderCollider` for the felt. That failed at the oval’s long axis (±X): physics stopped at radius 2.0 while the mesh extends to 2.30. The felt was switched to an elliptical disc trimesh with `FELT_SCALE` baked into vertices — same approach as rail/wall.

### Koozie ([`client/src/table3d/dice/koozieGeometry.ts`](../../client/src/table3d/dice/koozieGeometry.ts))

| Part | Collider | Builder |
|------|----------|---------|
| Walls | Extruded circular ring **trimesh** (open top) | `createKoozieWallColliderGeometry()` |
| Bottom / lid | **CylinderCollider** | kept — cup is circular; no non-uniform scale issue |
| Visual wall / rim / pick mesh | Shared builders | `createKoozieWallVisualGeometry()`, etc. |

Spawn poses and rim height stay in [`koozieColliders.ts`](../../client/src/table3d/dice/koozieColliders.ts). Removed `wallSegments` and `wallArcOverlap` tuning — no longer needed.

### Safety nets (unchanged)

[`DicePhysics.tsx`](../../client/src/table3d/dice/DicePhysics.tsx) still respawns dice below `fallThroughY` or outside an expanded ellipse. Fix colliders first; treat respawn as a backstop.

## Rejected alternatives

| Alternative | Why not |
|-------------|---------|
| **MeshCollider on render meshes** | Decorative rail highlight is visual-only; flat `circleGeometry` / `ringGeometry` are wrong for vertical walls; friction split across surfaces is harder. |
| **Segment cuboids (status quo)** | Gaps at joints, visible pylons in debug, tunneling at speed. |
| **Single `CylinderCollider` for outer wall** | Rapier cylinders are **solid**; containment must be **hollow** (no CSG). |
| **Scaled `CylinderCollider` for elliptical felt** | Non-uniform scale on colliders did not reliably match the visual ellipse; caused fall-through at ±X. |

## Consequences

- Changing table shape: edit [`layout.ts`](../../client/src/table3d/layout.ts) and/or [`tableGeometry.ts`](../../client/src/table3d/tableGeometry.ts) — mesh and colliders follow.
- Changing cup shape: edit cup tuning defaults in [`constants.ts`](../../client/src/table3d/dice/constants.ts) / [`tuning.ts`](../../client/src/table3d/dice/tuning.ts) and builders in [`koozieGeometry.ts`](../../client/src/table3d/dice/koozieGeometry.ts).
- Trimesh winding must face **inward** on containment rings so dice hit the inner surface.
- ~64 segments for table oval curves; 32 for koozie (performance is negligible at 120 Hz).
- **Future:** koozie bottom/lid could move to trimesh for full parity; cylinders are fine for now.

## Verification

- Playground `/dev/play` → **World → debug**: smooth ring wireframes, no wall pylons.
- Hard rolls into rail and felt edges; no escape or fall-through.
- `npm run check` && `npm test`.
