# Table UI guide — adding visuals, effects, and props

Read this **before any change to the game table's look or behavior** (chips, animations,
celebrations, skins, new 3D objects, layout). It exists so a change made in one place
cannot silently break another. The rules below are enforced by tests and hooks wherever
possible; where code stays complex for a reason, that reason is documented here.

## The one rule that prevents most bugs

**The table scene is rendered by three different components, depending on who is looking:**

| Renderer | When | File |
|---|---|---|
| `DicePhysics` | The active roller — real rapier physics | `client/src/table3d/dice/DicePhysics.tsx` |
| `RemoteDiceView` | Spectators during a streamed throw — replays poses, no physics | `client/src/table3d/dice/RemoteDiceView.tsx` |
| `StaticDiceView` | Everyone between turns — frozen last pose | `client/src/table3d/dice/StaticDiceView.tsx` |

**Last-roll dice on the felt:** the most recent `turn:rolled` stays visible for every
viewer until the next roller grabs/releases the koozie (or a streamed throw is in flight).
Spectators and the incoming roller see it through `StaticDiceView` — never a passive
`DicePhysics` mount with fixed slot layout. Only the active roller uses `DicePhysics`;
captured poses are tagged with `{ playerId, rollNumber }` and validated against
`state.lastRoll` before reuse (`staticPose.ts`).

They already share the presentational meshes (`PipDie`, `KoozieMesh`). **Any new visual
must either (a) live in a shared presentational component used by all three, or (b) be
driven by a table event (below) so it renders independently of which view is mounted.**
A visual wired into only `DicePhysics` will work on your screen and be invisible to every
other player — this is the #1 historical mistake shape.

## Adding an animation / effect → use table events

`client/src/table3d/tableEvents.ts` is a typed pub/sub bus for one-shot table happenings.
The straight celebration already flows through it — copy that pattern:

1. Add a member to the `TableEvent` union (e.g. `{ type: 'chips-to-pot'; amount: number }`).
2. Emit it where the game state changes — usually `Room.tsx` reacting to a snapshot/
   message (`tableEvents.emit(event, receivedAt)`). Stamp with the wire receive time.
3. Subscribe with `useTableEvent(type, handler, { replayLastMs })` inside the component
   that renders the effect. `replayLastMs` delivers a recent retained event to
   late-mounting views (spectator views mount only when a stream goes live) — use it,
   or mid-turn joiners will miss your effect.

**Never** thread a new effect prop through `Room → Table → TableCanvas → renderers`.
That prop-drilling pattern was removed deliberately.

## Adding a 3D object → place it at an anchor

`client/src/table3d/anchors.ts` defines named zones (`feltCenter`, `potZone`, `keptRail`,
`leftRail`, `rightRail`) whose positions **and clearance extents** are proven on-screen by
`anchors.test.ts` at the fixed camera. Content placed at an anchor, within its extents,
is in frame at every browser size (the viewport is always 16:9 — see Layout below).

- Mount new scene objects in `SceneContent` (`client/src/table3d/TableCanvas.tsx`),
  alongside `PokerTableMesh` — not inside `DicePhysics`.
- Need a new spot? Add an anchor with honest extents; the registry test covers it
  automatically. Do **not** hardcode raw coordinates without a framing assertion — use
  `projectToNdc` from `client/src/table3d/project.ts` if you must test a bespoke point
  (see the koozie framing tests in `diceLayout.test.ts` for the pattern).
- The camera is fixed (`SEAT_VIEW` in `layout.ts`) and the frame is nearly full at the
  top edge — the parked koozie's rim sits ~1% inside it. Assume there is **no slack**
  near edges; the tests will tell you.
- Physics props (knockable chips etc.) are a deliberate escalation: prefer non-physics
  meshes/animations first. Anything entering the rapier world must follow ADR 001/002
  (procedural colliders from layout constants, `liveBody()` guards).

## Reskinning → edit or pass a theme

All table/cup colors live in `client/src/table3d/theme.ts` (`TableTheme`,
`DEFAULT_TABLE_THEME`). `PokerTableMesh` and `KoozieMesh` accept a theme; custom koozie
looks are theme data plus (if shape changes) `koozieGeometry.ts`. Don't hardcode hex
values in mesh components.

## Table geometry — load-bearing invariants (all test-guarded)

- **The felt is a circle** (`FELT_SCALE.x === FELT_SCALE.z`, guarded in `layout.test.ts`).
  Streamed poses are localized per viewer by rotating around Y in seat-angle steps
  (`seatTransform.ts`); only a rotationally symmetric table maps onto itself under that
  rotation. Re-ovalizing the table puts other players' dice on the rail.
- **The parked koozie docks outside the containment wall** behind the far rail; dice
  cannot reach it, and a screen-space **grab guard** (`pointerAboveKoozieGuard`) ensures
  clicks anywhere a die can appear always go to the die. Framing + guard geometry is
  pinned by `diceLayout.test.ts`. See ADR 003 for placement history.
- **The rail apron** (in `PokerTableMesh`) is the occluder that hides the docked cup's
  sunken body — remove it and the cup floats through the table edge.

## 2D layout — how "fits in the browser" works

- `.table-3d-viewport` is **width-driven at a fixed 16:9** (index.css). Never give it a
  min-height or a different aspect: the camera, `project.ts`, the center overlay, and
  every framing test assume 16:9, and intrinsic min-widths regress horizontal scrolling
  (Chrome) / shrink-to-fit (Safari).
- Seat cards are positioned by **live measurement** (`useLayoutRects` + 
  `seatOverlayPosition`) — they self-adjust to any size; don't add fixed offsets.
- At ≤640px seats stack below the canvas. The breakpoint exists twice on purpose:
  `SEAT_STACK_QUERY` in `useMediaQuery.ts` and the `@media` block in `index.css` — keep
  them identical.
- New HUD/DOM overlays: prefer normal flow or measurement-driven positioning; never
  `100vw`; wide content scrolls inside its own container.

## DicePhysics.tsx — edit with care (and usually, don't)

It intentionally remains one file: it orchestrates a rapier world where **ordering is
behavior** (teleport-then-pull on cup grab, capture-phase pointer handling before r3f,
declarative-only placement of fixed bodies per ADR 003, `liveBody()` guards per ADR 002).
Pure logic has been extracted where safe — layout math in `diceLayout.ts`, per-die
runtime in `diceRuntime.ts`, cup motion in `koozieMotion.ts`, hit-testing in
`pointerToFelt.ts` — **extend those modules, not the component**, and add unit tests
next to them. Rules when you must touch it:

- Cup phases: `idle → held → pouring → settling → selecting → (idle | hidden)`. State
  transitions happen in exactly one place each; search `setCupPhase` before adding one.
- While `held`, unkept dice stay dynamic for slosh but are **velocity-clamped every
  frame** (`heldMaxLinVel` / `heldMaxAngVel` in tuning) so a laggy kinematic cup
  cannot explode in-cup contacts (ADR 002).
- Fixed/locked bodies move **declaratively only** (props / `layoutGen` remounts); never
  `setTranslation` on a fixed body (rapier skips mesh sync — invisible desync).
- The window-level capture `pointerdown` handler must `return` (no `stopPropagation`)
  on rejected cup grabs, or die clicks die with it.
- Every reactive RigidBody prop must be a **stable value** — a per-render computed
  position/rotation teleports bodies on unrelated re-renders (historical jitter bug).

## Checklist before "done" (UI work)

1. Does the change render correctly for **roller, spectator, and between turns**?
2. New scene content: at an anchor or framing-tested? New effect: on the event bus with
   replay? New colors: in the theme?
3. `npm run verify` green (framing/symmetry/guard tests are the net).
4. Browser check per `docs/browser-testing.md` (multi-tab — one view is never enough).
