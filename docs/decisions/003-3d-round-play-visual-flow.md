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
| **Parked / idle koozie** | Docked **outside the containment wall past the far rail**, straight across from the roller, sunken so only the rim band peeks over the rail (`koozieRestPosition`) — same spot for idle and park so the grab target stays stable, and dice physically cannot reach it. Still **inside the fixed camera frame** (a framing test projects it — including the worst-case far rim edge — through `SEAT_VIEW`; the original on-felt spot let dice settle under the cup, and higher outside-the-rail spots were off-screen). Visible only when `canDrag` (roller). |
| **Kept dice** | On the **near rail** (+Z, toward the roller): row centered on X with gap `DIE_SIZE + 0.025`, Y on top of padded rail. Also framing-tested. |
| **Unkept dice** | Stay on felt at settled physics pose; pose snapshotted in `feltPoseRef` for un-keep restore. |

### 3-player table orientation

- Fixed **3 seats** at 120° spacing ([`TABLE_SEAT_COUNT`](../../client/src/table3d/layout.ts)).
- The scene, camera, and physics **never rotate**: every client simulates and renders in its own view space with the local player at the bottom (+Z). `DicePhysics` is seat-agnostic.
- Seat identity is applied to pose **data** at the wire boundary ([`seatTransform.ts`](../../client/src/table3d/seatTransform.ts)): the roller canonicalizes outbound frames (`poseFrameToCanonical`), viewers localize inbound frames (`poseFrameFromCanonical`). `rotateBodyPoseY` is pinned to three.js rotation conventions by test — a rotated `<group>` around the scene was rejected because rapier bodies simulate in world space, so imperative teleports and declarative props ended up in different coordinate spaces (and the group also rotated the elliptical table itself).

Positions use world/table constants from [`layout.ts`](../../client/src/table3d/layout.ts), not viewport gutter projection.

### Interaction

- **Click-to-keep** on 3D dice during `selecting`. Server-locked indices (`turn.keptIndices`) are not clickable.
- **Clicking the parked koozie commits the keep set** — cup pull into koozie happens on **grab** (`pullUnkeptDiceIntoCup`, after the cup teleports onto the felt). A screen-space **grab guard** (`pointerAboveKoozieGuard`, anchored to `KOOZIE_GRAB_GUARD_POINT`) gates both grab paths: cup grabs are honored only above the projection of the highest point a settled die stack can occupy at the far boundary, so a click anywhere a die can appear always goes to the die — this is what keeps the generous cup hit radii (`hitScreenPx`/`hitRadius`) safe, and it projects through the live camera so it holds at any canvas size.
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
- **2026-07-07 update (table symmetry):** the felt became a **circle** (`FELT_SCALE` isotropic, guarded by a layout test). Seat identity is applied by rotating pose data around Y, and only a rotationally symmetric table maps onto itself under that rotation — on the old 1.15×0.95 oval, a remote roller's settled dice appeared on or past the rail in other players' views. Also: the previous turn's frozen pose now stays on the felt for the next roller **until they grab the koozie** (Room.tsx `showHeldPose` gates on dragging/rolling/dice; the idle sim's own dice are hidden in the docked cup, so the two never overlap). A captured pose is only shown if its top faces equal the authoritative last roll (`poseFrameMatchesDice` vs `turn:rolled`); otherwise a static pose is rebuilt from the roll values — per-client capture pipelines (local frames vs streamed frames) can be stale, and clients must never disagree on the faces.
- **2026-07-07 update:** the parked koozie moved off the felt to a **dock beyond the containment wall** behind the far rail (rim peeking over). The on-felt spot let dice settle against/under the parked cup, where the generous pickup hit-test stole their clicks (misclick = keep set committed). Pull-into-cup-on-grab alone was insufficient; the dock plus the **grab guard line** (above) makes far-rail dice always clickable by construction. On grab from the dock, `pullUnkeptDiceIntoCup` now includes dice already inside the cup (`includeCupDice`) so a mid-turn remount can't strand them outside the wall. The vestigial `KOOZIE.home`/`cup.homeZ` constants and the Playground `cupHomeZ` slider were deleted — `koozieRestPosition` is the single source of the parked position.

## Verification

- `npm run check` && `npm test`
- Playground `/playground`: roll → koozie across table → click dice to rail → unkeep restores felt pose → click koozie → drag → release re-rolls unkept only

## See also

- [002 — Rapier physics stack](./002-rapier-physics-stack.md)
