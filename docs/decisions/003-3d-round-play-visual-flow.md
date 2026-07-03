# 003. 3D round-play visual flow (Playground)

**Status:** accepted  
**Date:** 2026-07-03

## Context

The Playground 3D dice prototype could pour and settle, but after each roll it immediately respawned unkept dice inside the cup at a fixed home pose. Keep selection lived only in the 2D `DiceRow` below the table. That did not match how a round should feel: roll → review dice on the felt → keep some → grab the koozie again → re-roll.

Production `Room.tsx` still uses 2D dice; this decision scopes the spatial UX to the dev Playground first (`canDrag: true` on the active roller only).

## Decision

### Turn phases

After dice settle, enter a **`selecting`** phase instead of `resetToIdleInCup()`:

1. **Roll** — grab koozie at near-side home, drag, release to pour (unchanged for first roll).
2. **Select** — unkept dice freeze where they landed; kept dice move to the near rail; koozie parks across the table.
3. **Re-roll** — click parked koozie → it teleports near the cursor (table-bounded) → drag → on release, unkept felt dice jump into the cup and pour.

Orchestration lives in [`DicePhysics.tsx`](../../client/src/table3d/dice/DicePhysics.tsx). Playground wires `onKeepToggle` and `lockedKeepIndices` via [`Playground.tsx`](../../client/src/dev/Playground.tsx); shared toggle logic in [`keepSelection.ts`](../../client/src/game/keepSelection.ts).

### Layout ([`diceLayout.ts`](../../client/src/table3d/dice/diceLayout.ts))

| Element | Placement |
|---------|-----------|
| **Parked koozie** | Across the table from the roller — world `(0, floatY, −homeZ)`, mirroring idle home on the far (−Z) side. Visible only when `canDrag` (roller). |
| **Kept dice** | On the **near rail** (+Z): row centered on X, side-by-side with gap `DIE_SIZE + 0.025`, Y on top of padded rail (`TABLE.railHeight + DIE_HALF`). |
| **Unkept dice** | Stay on felt at settled physics pose; pose snapshotted in `feltPoseRef` for un-keep restore. |

Positions use world/table constants from [`layout.ts`](../../client/src/table3d/layout.ts), not viewport gutter projection.

### Interaction

- **Click-to-keep** on 3D dice during `selecting` and `held` (while dragging koozie). Server-locked indices (`turn.keptIndices`) are not clickable.
- **Dice stay on felt during drag** — cup pull into koozie happens on **release** (`pullUnkeptDiceIntoCup`), so players can still hover/click felt dice while aiming.
- **Cursors:** `grab` on koozie hover (idle/selecting), `pointer` on selectable dice hover, `grabbing` while dragging. Handled via pointer enter/leave on [`KoozieBody`](../../client/src/table3d/dice/KoozieBody.tsx) and [`DieBody`](../../client/src/table3d/dice/DieBody.tsx).
- **Teleport** = instant snap (no lerp in v1).

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

- `TableDiceProps` adds `onKeepToggle` and `lockedKeepIndices` ([`types.ts`](../../client/src/table3d/dice/types.ts)).
- `releaseSignal` remains unused; roll is pointer-driven.
- Spectators (`canDrag: false`) do not see the parked koozie; they still get fixed die slots from `buildRuntime` without cup mode.
- **Follow-ups:** production Room WebSocket wiring, animated lerp instead of teleport, spectator 3D selection view.

## Verification

- `npm run check` && `npm test`
- Playground `/playground`: roll → koozie across table → click dice to rail → unkeep restores felt pose → click koozie → drag → release re-rolls unkept only

## See also

- [002 — Rapier physics stack](./002-rapier-physics-stack.md)
