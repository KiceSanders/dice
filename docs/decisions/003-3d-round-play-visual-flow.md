# 003. 3D round-play visual flow (Playground)

**Status:** accepted  
**Date:** 2026-07-03

## Context

The Playground 3D dice prototype could pour and settle, but after each roll it immediately respawned unkept dice inside the cup at a fixed home pose. Keep selection lived only in the 2D `DiceRow` below the table. That did not match how a round should feel: roll → review dice on the felt → keep some → grab the koozie again → re-roll.

Production `Room.tsx` still uses 2D dice; this decision scopes the spatial UX to the dev Playground first (`canDrag: true` on the active roller only).

## Decision

### Turn phases

After dice settle, enter a **`selecting`** phase instead of `resetToIdleInCup()`:

1. **Roll** — click koozie on the far side of the table (straight across from the roller); it teleports into play bounds at the cursor, then drag and release to pour.
2. **Select** — unkept dice freeze where they landed; kept dice move to the near rail toward the roller; koozie parks outside the **far** edge (opposite the roller) so it never covers selectable felt dice.
3. **Re-roll** — click parked koozie → same teleport into play bounds, unkept felt dice jump into the cup, drag → on release, the cup pours.

Orchestration lives in [`DicePhysics.tsx`](../../client/src/table3d/dice/DicePhysics.tsx). Playground wires `onKeepToggle` and `lockedKeepIndices` via [`Playground.tsx`](../../client/src/dev/Playground.tsx); shared toggle logic in [`keepSelection.ts`](../../client/src/game/keepSelection.ts).

### Layout ([`diceLayout.ts`](../../client/src/table3d/dice/diceLayout.ts))

| Element | Placement |
|---------|-----------|
| **Parked / idle koozie** | On the felt against the **far rail**, straight across from the roller (`koozieRestPosition`) — same spot for idle and park so the grab target stays stable, outside play bounds but **inside the fixed camera frame** (a framing test projects it through `SEAT_VIEW`; an earlier outside-the-rail spot was off-screen). Visible only when `canDrag` (roller). |
| **Kept dice** | On the **near rail** (+Z, toward the roller): row centered on X with gap `DIE_SIZE + 0.025`, Y on top of padded rail. Also framing-tested. |
| **Unkept dice** | Stay on felt at settled physics pose; pose snapshotted in `feltPoseRef` for un-keep restore. |

### 3-player table orientation

- Fixed **3 seats** at 120° spacing ([`TABLE_SEAT_COUNT`](../../client/src/table3d/layout.ts)).
- The scene, camera, and physics **never rotate**: every client simulates and renders in its own view space with the local player at the bottom (+Z). `DicePhysics` is seat-agnostic.
- Seat identity is applied to pose **data** at the wire boundary ([`seatTransform.ts`](../../client/src/table3d/seatTransform.ts)): the roller canonicalizes outbound frames (`poseFrameToCanonical`), viewers localize inbound frames (`poseFrameFromCanonical`). `rotateBodyPoseY` is pinned to three.js rotation conventions by test — a rotated `<group>` around the scene was rejected because rapier bodies simulate in world space, so imperative teleports and declarative props ended up in different coordinate spaces (and the group also rotated the elliptical table itself).

Positions use world/table constants from [`layout.ts`](../../client/src/table3d/layout.ts), not viewport gutter projection.

### Interaction

- **Click-to-keep** on 3D dice during `selecting`. Server-locked indices (`turn.keptIndices`) are not clickable.
- **Clicking the parked koozie commits the keep set** — cup pull into koozie happens on **grab** (`pullUnkeptDiceIntoCup`), so dice cannot sit underneath the parked cup and become unselectable.
- **Cursors:** `grab` on koozie hover (idle/selecting), `pointer` on selectable dice hover, `grabbing` while dragging. Handled via pointer enter/leave on [`KoozieBody`](../../client/src/table3d/dice/KoozieBody.tsx) and [`DieBody`](../../client/src/table3d/dice/DieBody.tsx).
- **Teleport on grab** from `idle` or `selecting` when the koozie is outside play bounds — instant snap to a table-bounded point at the cursor; no dragging while off-table.

### UI

2D `DiceRow` hidden in Playground (`hide2DDice`); 3D is the sole keep UI. Instruction copy updated in [`GameArea.tsx`](../../client/src/components/GameArea.tsx) and Playground hint bar.

## Rejected alternatives

| Alternative | Why not |
|-------------|---------|
| **Viewport left-gutter tray** | Kept dice and parked koozie floated in screen space off the felt; did not read as “on the table.” |
| **Pull dice into cup on grab** | Prevented hover/click-to-keep while dragging the koozie over felt dice. |
| **2D + 3D keep UI in parallel** | Redundant; Playground uses 3D only when `hide2DDice`. |
| **Wire to production Room in same pass** | Playground is the only 3D dice consumer; props are shaped for later Room adoption. |

## Consequences

- `releaseSignal` remains unused; roll is pointer-driven.
- Spectators (`canDrag: false`) do not see the parked koozie; they still get fixed die slots from `buildRuntime` without cup mode.
- Fixed/locked bodies are placed **declaratively only** (position props, remounts via `layoutGen`); rapier skips mesh sync for sleeping fixed bodies, so imperative `setTranslation` on them moves physics without the visual. Imperative teleports remain only for dynamic dice mid-interaction (`pullUnkeptDiceIntoCup`) and the grabbed kinematic cup.
- **Follow-ups:** production Room WebSocket wiring, animated lerp instead of teleport, spectator 3D selection view.
- **2026-07-03 update:** production Room keeps the last settled table pose visible across turn switches and delays the round-end modal 3 seconds, so the final roll remains readable before winner reveal.
- **2026-07-04 update:** a **Stand** button renders on the table frame gutter (outside the play area, like the parked koozie). Voluntary stands are gated by the shared `canStandVoluntarily` rule — blocked while the current hand loses to the roll-to-beat (ties allowed; they force the sub-round) — and the server enforces the same rule on `turn:stand` (`STAND_NOT_ALLOWED`). Forced stands (roll cap, keep-all, timeout/disconnect/kick) bypass the gate.

## Verification

- `npm run check` && `npm test`
- Playground `/playground`: roll → koozie across table → click dice to rail → unkeep restores felt pose → click koozie → drag → release re-rolls unkept only

## See also

- [002 — Rapier physics stack](./002-rapier-physics-stack.md)
