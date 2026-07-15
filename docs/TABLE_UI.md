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
That includes a losing hand after its turn advances and the final losing hand throughout
round end; it must never be replaced by the earlier leader's `rollToBeat` hand. When the
latest roller owns the hand stored in `rollToBeat` (the first listed holder), that stood
pose wins so post-settle keep moves remain visible; later tied players keep their latest
settled pose because `rollToBeat` still stores the first holder's dice.
Spectators and the incoming roller see it through `StaticDiceView`, fed by **one resolver**:
`resolveTableRestPose` in `staticPose.ts` (ADR 005). Its priority is the server-validated
`restPose` carried on `turn:rolled`, optionally refined by `turn:stand`, and every snapshot
(canonical space → rotated to the
viewer's seat), with the values-only slot layout as a last resort that logs
`[dice] slot-layout fallback` in dev and counts on `window.__diceDebug`. **Adding a new
pose source means adding a tier inside that resolver — never a new per-client capture
path**; the old opportunistic captures (roller sim / streamed-frame snapshots) were exactly
the recurring center-line regression and were deleted. Note the kept-dice consequence: with
an authoritative pose, kept dice render at the *roller's* rail edge for every viewer (same
as live streaming); only the slot fallback rails them viewer-locally.

**Turn-handoff invariant:** while that previous hand remains visible, the incoming
roller's idle physics dice stay hidden in the docked cup. Local pending keeps are owned by
the exact player/roll version; an outgoing turn's keeps must never reach the incoming
roller. `buildRuntime` also fails closed: a keep index without a committed die value cannot
create a visible rail die. Before the incoming roller grabs, exactly the previous hand's
five dice are visible — never an additional row of identity-rotation face-1 dice.

They already share the presentational meshes (`PipDie`, `KoozieMesh`). **Any new visual
must either (a) live in a shared presentational component used by all three, or (b) be
driven by a table event (below) so it renders independently of which view is mounted.**
A visual wired into only `DicePhysics` will work on your screen and be invisible to every
other player — this is the #1 historical mistake shape.

**Yahtzee bonus mode** (docs/GAME_RULES.md "Yahtzee bonus") temporarily extends the live
dice runtime without changing the five-die hand: while `turn.bonusPending` is set,
`useTableRoll` mounts `DicePhysics` with `bonusMode` and a forced keep set `[0,1,2,3,4]`
(TableCanvas flips the component `key`, so the runtime rebuilds). All 5 quint dice sit
railed and a temporary sixth die rides in the cup; settled runtime `values[5]` alone is
reported as `turn:bonusThrowResult`. The sixth body is removed immediately after settle,
the five-die rest pose remains untouched, and the server auto-stands the player. Keep
clicks are disabled and the Stand button renders disabled with a "throw the bonus die"
hint. Spectators render up to 6 streamed dice through `RemoteDiceView`; ordinary throws
still hide its unused sixth mesh. The match payout animates via the existing
`chips-between-players` event (`yahtzee:paid` → `lastTransfer`).

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

The animated pot follows this path with `chips-to-pot` and `pot-to-winner` events, and
instant player-to-player payouts (straight payments today) with `chips-between-players` —
a new instant side bet animates for free by setting `lastTransfer` in the store reducer;
Room.tsx emits the event and the overlay flies chips seat-to-seat, pot untouched. Its
renderer is an independent, pointer-transparent DOM canvas in `PotChipOverlay`, so it is
present for the active roller, spectators, and the static between-turn view without being
owned by any dice renderer. Live ante messages carry exact per-player payments; snapshots
remain the authority for the final pot total. The pre-ante pot count (`potBefore`) is
captured in the store reducer at message time — reading it later in a React effect races
the post-ante `room:state`, which can flush in the same render and make the pyramid show
the final total before the chips arrive. The flight canvas draws in viewport
coordinates and is portaled to `<body>`: `.table-top-band` is a transformed ancestor, and
a transform re-roots `position: fixed` descendants onto itself — mounting the canvas
inside the band squashes it into the band's box and lands chips beside roll-to-beat.

## Audio — impacts, rattle, and adding a sound

All audio lives in `client/src/table3d/audio/` and plays through one Web Audio graph
(`audioEngine.ts` — the only impure module; everything deciding *what* to play is pure and
unit-tested). The single subscriber is `TableAudio` (mounted once in `Room.tsx`, outside
the canvas), so sound exists for the roller, spectators, and between turns regardless of
which dice renderer is up — the three-renderer rule is satisfied by construction.

**Two buses, on purpose:**

- `audioBus.ts` carries high-frequency impact/rattle cues (dozens per throw,
  renderer-local, never replayed — sticky replay would re-fire stale clacks).
- `tableEvents.ts` stays the source for game-moment one-shots (straight bell, chip
  sounds). `TableAudio` subscribes the existing members with a short `replayLastMs`.

**Where impact cues come from (both sides of the three-renderer rule):**

- **Roller** — `onContactForce` on each die's collider (`DieBody`) calls
  `rollerImpacts.ts`; the surface hit is read from collider `name` props (`die`, `felt`,
  `rail`, `wall`, `cup-bottom`, `cup-wall`, `cup-lid` — set in DieBody/TableColliders/
  KoozieBody; unnamed or `ceiling` colliders are silent). The pure gate in
  `impactRules.ts` turns the per-step force stream into discrete plays (per-pair
  threshold + rising edge + cooldown + global rate cap) and force magnitude sets volume.
- **Spectators** — no physics bodies, so `useRemoteRoll` feeds the same view-space pose
  frames into `remotePoseAudio.ts`; `poseImpacts.ts` derives impacts from velocity
  changes and schedules them `REMOTE_PLAYBACK_DELAY_MS` late to line up with the delayed
  visuals.
- **Cup rattle** — not discrete events: a seamless loop whose gain follows the leaky
  integrator in `rattle.ts`, fed by die-cup contact forces (roller) or pose-derived shake
  (spectators).

**Adding a sound (the whole recipe):**

1. Run the file through `scripts/normalize-audio.sh`, drop it in `client/public/audio/`,
   add a line to `CREDITS.md` there.
2. Add a `SoundId` entry in `sampleManifest.ts` (multiple files = random variations).
3. Map a cue to it in `cues.ts`.
4. Trigger it: physics impact → extend `classifyPair`/`AUDIO_TUNING`; game moment → emit
   a `tableEvents` member as usual and add one `useTableEvent` line in `TableAudio.tsx`.

`sampleManifest.test.ts` fails if a manifest file is missing on disk, and
`cues.test.ts` fails if a cue maps to nothing — a broken step 1–3 cannot pass `npm test`.

**Tuning and settings:** every constant (force thresholds, cooldowns, pose-detector
thresholds, pan width, pitch jitter) lives in `audioTuning.ts`. To recalibrate force
thresholds against real contacts, set `localStorage['dice:audio-debug'] = '1'` and read
the logged per-pair magnitudes. Volume/mute is a client-local preference
(`audioSettings.ts`, key `dice:audio`, HUD control in `GameHud`) — personal, never a
`RoomSettings` field. Browser autoplay: the context unlocks on the first
pointer/keyboard gesture; earlier cues are dropped silently.

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
- The camera is fixed (`SEAT_VIEW` in `layout.ts`) and the frame is tight at the
  edges — both the fixed physics docks and the spectator koozie at every supported
  occupied-card angle are framing-tested. Assume there is **no slack** near edges;
  the tests will tell you.
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
- **The parked koozie docks outside the containment wall**; dice cannot reach it.
  The roller's interactive cup uses the fixed local physics dock
  (`koozieRestPosition`, display seat 0). A screen-space **grab guard**
  (`pointerBelowNearDockGuard`) ensures keep-clicks on the near rail always go to
  the die. Spectators instead see a non-interactive `ParkedKoozie` whenever they
  are not the roller and no remote throw is streaming. That presentation-only cup
  must use the active card's `seatDisplayAngle` and `koozieRestPositionAtAngle`, so
  it stays directly in front of the player who is throwing after occupied seats
  reflow. Framing + guard geometry is pinned by `diceLayout.test.ts`; see ADR 003.
- **The rail apron** (in `PokerTableMesh`) is the occluder that hides the docked
  cup's sunken body on side seats — remove it and the cup floats through the table
  edge. Seat 0 only needs the rim band in frame.

## 2D layout — how "fits in the browser" works

- `.table-3d-viewport` is **width-driven at a fixed 16:9** (index.css). Never give it a
  min-height or a different aspect: the camera, `project.ts`, the center overlay, and
  every framing test assume 16:9, and intrinsic min-widths regress horizontal scrolling
  (Chrome) / shrink-to-fit (Safari).
- On non-stacked layouts, the **whole table frame is capped by the live visual viewport
  height** (`viewportFit.ts` + `Table.tsx`). This accounts for browser chrome, display
  scaling, zoom, and window resizing: when height is scarcer than width, the frame gets
  narrower while the viewport stays exactly 16:9. Keep the mirrored border, band, and
  gutter dimensions in `viewportFit.ts` synchronized with `.table-3d` CSS. Do not apply
  the cap to stacked mode, whose seats intentionally flow below the canvas.
- Seat cards are positioned by **live measurement** (`useLayoutRects` + 
  `seatOverlayPosition`) — they self-adjust to any size; don't add fixed offsets.
  Cards are one row (full name · chip count), auto-sized up to a max width; long
  names step the font down (`seat-name--*` tiers) instead of ellipsizing. Because
  side-gutter cards grow outward, `ClampedSeatAnchor` (SeatOverlay) measures each
  card and clamps it horizontally inside the frame via `clampCardLeftPx`
  (layout.ts) — `seatCardRect` mirrors the same clamp for the layout tests, and
  `SEAT_CARD_SIZE_PX` must match the `.seat` CSS max size.
- The card's background tint is the player's in-hand status: green = holds the
  roll to beat (all tied holders), orange (pulsing) = rolling now, red = out of
  this hand, neutral = waiting to act. Your own name is gold-underlined (the
  local player is always the 6 o'clock card). Cards carry **no actions** — host
  controls (kick) live in `HostPanel` below the table.
- Room capacity is a fixed eight logical seats. The lobby displays all eight slots; during
  play and round end, `visibleSeatIndices` supplies occupied slots only. `seatDisplayOrder`
  rotates that list around the local player, and adding/removing a player reflows the cards.
- At ≤640px seats stack below the canvas. The breakpoint exists twice on purpose:
  `SEAT_STACK_QUERY` in `useMediaQuery.ts` and the `@media` block in `index.css` — keep
  them identical.
- New HUD/DOM overlays: prefer normal flow or measurement-driven positioning; never
  `100vw`; wide content scrolls inside its own container.

### Reserved arcs — where seats and game-state widgets go

Think of the table frame as a clock face:

- **Seats occupy only the lower arc, 2 → 10 o'clock (through 6).** `seatAngle`
  (`layout.ts`) distributes any seat count evenly along that arc
  (`SEAT_ARC_START`/`SEAT_ARC_SPAN`), with the local player fixed at 6 o'clock and
  later throwing-order seats proceeding clockwise up the left side, wrapping across the
  reserved gap, then continuing down the right. Sparse tables use the full arc: two
  players sit at 6 and 10 o'clock, while three match the historical 6/10/2 layout. Layout
  tests pin the arc bounds for counts 1–8, so the top of the frame is provably
  seat-free at any count.
- **The top arc, 10 → 2, belongs to game-state widgets** (ante pot, roll-to-beat, and
  Classic Pot). They render inside `.table-top-band` — a three-lane grid overlaying the
  top of the canvas, biased slightly right so Classic Pot sits nearer the frame corner:
  ante pot left, roll-to-beat center, Classic Pot (gold-coin pyramid + “Classic Pot”
  label under it) on the right. **To add one: append it to the appropriate lane in
  `Table.tsx`, done.** Normal flow spaces siblings, so widgets can never overlap each
  other, and the band-vs-seats layout test (`layout.test.ts`, paired constants
  `TOP_BAND_MAX_WIDTH_PCT`/`TOP_BAND_CENTER_PCT`/`TOP_BAND_HEIGHT_PX` ↔ `.table-top-band`
  CSS) proves the band clears every seat card. Player-specific UI never goes in the
  band — it belongs at that player's seat.
  **The band is HUD chrome, never an occluder.** The band row (`--table-top-band-h`)
  reserves vertical space above the 16:9 viewport, but it is still playing field: the
  canvas element bleeds up over it (`.table-canvas` top offset) and `FixedCamera`
  extends the frustum upward with a matching `setViewOffset` (`frameViewOffset` in
  `project.ts`, test-pinned) — the virtual 16:9 camera frame stays exactly the viewport
  rect, so all framing/overlay/picking math is unchanged. The band stacks *under* the
  canvas (band `z-index: 0`, viewport `z-index: 1`) and the canvas renders with a
  transparent background (`gl alpha: true`, no scene `<color attach="background">`), so
  the widgets show through empty pixels while rendered geometry — a koozie raised into
  the top arc — paints over them. Invariants: the band stays `pointer-events: none`
  (its widgets are display-only; anything interactive belongs elsewhere), the Canvas
  camera stays `manual` (r3f's responsive resize would overwrite the pinned aspect and
  view offset), and the fog color (`theme.background`) must equal the page `--bg` or a
  visible horizon seam appears where the felt fades into the page.
- **Card angles are not pose angles.** The fixed eight logical seats use the uniform
  full-circle `seatRingAngle` for live dice/cup pose canonicalization and the roller's
  physics dock; the occupied card list independently reflows on the lower arc. Never
  use the card angle to canonicalize streamed poses. The deliberate exception is the
  read-only spectator `ParkedKoozie`: it is seat-card chrome, not a live pose, and must
  use `seatDisplayAngle` plus `koozieRestPositionAtAngle`. Never derive it from
  `displaySeatIndex`/`seatRingAngle`, or it will sit beside the throwing player's card
  on sparse tables. `diceLayout.test.ts` framing-checks both angle systems.

Room chrome: the table frame sits at the very top of the page (no header above it —
vertical space is play space). The room code / invite link / connection text live in a
`.room-info` card at the bottom of the page (visible on scroll); the always-visible
connection signal is the `.conn-corner` red/green dot in the frame's top-right corner
(Table's `connection` prop). At ≤640px (`SEAT_STACK_QUERY`) seat overlays unmount and
seats flow below the canvas; the band overlays the canvas's top edge at every size.

## DicePhysics.tsx — edit with care (and usually, don't)

It intentionally remains one file: it orchestrates a rapier world where **ordering is
behavior** (teleport-then-pull on cup grab, capture-phase pointer handling before r3f,
declarative-only placement of fixed bodies per ADR 003, `liveBody()` guards per ADR 002).
Pure logic has been extracted where safe — layout math in `diceLayout.ts`, per-die
runtime in `diceRuntime.ts`, cup motion in `koozieMotion.ts`, hit-testing in
`pointerToFelt.ts` / `dicePointer.ts`, phase edges in `cupPhaseMachine.ts`, settle
handoff in `diceSettleHandoff.ts` — **extend those modules, not the component**, and
add unit tests next to them. Geometry constants are also re-exported from
`client/src/table3d/geometry.ts`. Rules when you must touch it:

- Cup phases: `idle → held → pouring → settling → selecting → (idle | hidden)`. State
  transitions happen in exactly one place each; search `setCupPhase` before adding one.
- While `held`, unkept dice stay dynamic for slosh but are **velocity-clamped every
  frame** (`heldMaxLinVel` / `heldMaxAngVel` in tuning) so a laggy kinematic cup
  cannot explode in-cup contacts. This is an energy backstop, not the Chromebook
  performance fix; the earlier timestep/clamp experiment did not help (ADR 002).
- Hard CCD must stay off on the local dice and koozie. Chromebook profiling traced
  86–121 ms steps to hard-CCD TOI searches; `SOFT_CCD_PREDICTION` supplies the needed
  predictive contacts while preserving dynamic slosh. Read ADR 002's measured test
  matrix and future-tuning guardrails before changing CCD, timestep, or cup colliders.
- Fixed/locked bodies move **declaratively only** (props / `layoutGen` remounts); never
  `setTranslation` on a fixed body (rapier skips mesh sync — invisible desync).
- The window-level capture `pointerdown` handler must `return` (no `stopPropagation`)
  on rejected cup grabs, or die clicks die with it.
- Touch scrolling stays enabled until a koozie grab succeeds. While the cup is
  actively dragged, the window-level non-passive `touchmove` guard cancels page
  scrolling; it must stop canceling as soon as the drag ends so ordinary table
  touches can still scroll the room page.
- Every reactive RigidBody prop must be a **stable value** — a per-render computed
  position/rotation teleports bodies on unrelated re-renders (historical jitter bug).

## Checklist before "done" (UI work)

1. Does the change render correctly for **roller, spectator, and between turns**?
2. New scene content: at an anchor or framing-tested? New effect: on the event bus with
   replay? New colors: in the theme? New sound: through the audio recipe above (manifest
   + cue mapping), audible for all three viewers?
3. `npm run verify` green (framing/symmetry/guard tests are the net).
4. Hand the user the browser checklist from `docs/browser-testing.md` (multi-tab — one
   view is never enough). Never launch or drive browser testing unless explicitly asked.
