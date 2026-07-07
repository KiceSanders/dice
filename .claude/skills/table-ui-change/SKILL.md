---
name: table-ui-change
description: >
  Change the game table's look or behavior — chips, animations, celebrations,
  skins/themes, new 3D props, cup/dice visuals, or room layout. Use whenever a
  task touches client/src/table3d/, index.css table/seat rules, or adds any
  visual/effect players see on the table.
---

# Table UI change

Read [docs/TABLE_UI.md](../../../docs/TABLE_UI.md) first — it is the rulebook this
procedure walks. The invariants are test-guarded; trust failing tests over instinct.

1. **Classify the change** and take the matching path:
   - **Effect/animation** (something happens once and views react) → add a `TableEvent`
     member in `client/src/table3d/tableEvents.ts`, emit from `Room.tsx` (stamped with
     the wire receive time), subscribe with `useTableEvent(..., { replayLastMs })` in the
     rendering component. Never thread a new prop through Table/TableCanvas.
   - **New 3D object** → mount in `SceneContent` (TableCanvas.tsx), positioned at a
     `TABLE_ANCHORS` zone (anchors.ts) within its extents; new spots become new anchors
     so `anchors.test.ts` covers them. No raw coordinates without a framing test.
   - **Look/skin** → edit `client/src/table3d/theme.ts` (or thread a theme override);
     never hardcode colors in mesh components.
   - **Dice/cup layout math** → pure modules (`diceLayout.ts`, `diceRuntime.ts`,
     `koozieMotion.ts`) with tests beside them — not DicePhysics.tsx.
   - **Room/page layout** → keep `.table-3d-viewport` width-driven 16:9; keep
     `SEAT_STACK_QUERY` and the 640px CSS block identical; no `100vw`, no fixed
     min-widths.
2. **Three-renderer check**: will the roller, a spectator, AND the between-turns static
   view all show it? (docs/TABLE_UI.md table). If any answer is "no", use the event bus
   or a shared presentational component.
3. **DicePhysics.tsx**: only touch it if a cup-phase behavior itself changes; follow the
   "edit with care" rules in docs/TABLE_UI.md and re-read ADR 003 first.
4. **Tests**: framing for anything visible (anchor registry or `projectToNdc`), unit
   tests beside any pure-module change. `npm run verify` must pass.
5. **Docs-sync**: placement/interaction decisions → amend ADR 003; new invariants →
   docs/TABLE_UI.md, same commit.
6. Finish with the multi-tab browser flows in docs/browser-testing.md — one view is
   never enough (hand the checklist to the user if they run browser verification).
