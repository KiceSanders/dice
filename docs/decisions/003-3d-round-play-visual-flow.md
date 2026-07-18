# 003. 3D round-play visual flow (Playground)

**Status:** accepted  
**Date:** 2026-07-03

## Context

The Playground 3D dice prototype could pour and settle, but after each roll it immediately respawned unkept dice inside the cup at a fixed home pose. Keep selection lived only in the 2D `DiceRow` below the table. That did not match how a round should feel: roll → review dice on the felt → keep some → grab the koozie again → re-roll.

Production `Room.tsx` still uses 2D dice; this decision scopes the spatial UX to the dev Playground first (`canDrag: true` on the active roller only).

## Decision

### Turn phases

After dice settle, enter a **`selecting`** phase instead of `resetToIdleInCup()`:

1. **Roll** — click koozie in front of the roller (outside the near rail at display seat 0); it teleports into play bounds at the cursor, then drag and release to pour.
2. **Select** — unkept dice freeze where they landed; kept dice move to the near rail toward the roller; koozie parks outside the **active player's seat** so it never covers selectable felt dice.
3. **Re-roll** — click parked koozie → same teleport into play bounds, unkept felt dice jump into the cup, drag → on release, the cup pours.

Orchestration lives in [`DicePhysics.tsx`](../../client/src/table3d/dice/DicePhysics.tsx). Playground wires `onKeepToggle` via [`Playground.tsx`](../../client/src/dev/Playground.tsx); shared toggle logic in [`keepSelection.ts`](../../client/src/game/keepSelection.ts).

### Layout ([`diceLayout.ts`](../../client/src/table3d/dice/diceLayout.ts))

| Element | Placement |
|---------|-----------|
| **Parked / idle koozie** | Docked **outside the containment wall**, sunken so only the rim peeks over the rail (the bottom-seat body may sit just under the near-camera fringe — framing tests require the rim band). Dice physically cannot reach it. The roller's interactive cup (`DicePhysics`) uses the view-local bottom physics dock (`koozieRestPosition(cup, 0)`). Whenever no remote throw is live, spectators see a read-only [`ParkedKoozie`](../../client/src/table3d/dice/ParkedKoozie.tsx) at the active player's shared `SeatDisplayPlacement` angle (`koozieRestPositionAtAngle`), directly in front of the player who is throwing. |
| **Kept dice** | On the **near rail** (+Z, toward the roller): row centered on X with gap `DIE_SIZE + 0.025`, Y on top of padded rail. Also framing-tested. |
| **Unkept dice** | Stay on felt at settled physics pose; pose snapshotted in `feltPoseRef` for un-keep restore. Releasing a die kept on an earlier roll (no this-roll felt pose) places it at `dieSlotPosition` near the table center. |

### 8-player table orientation

- Fixed capacity of **8 logical seats** ([`TABLE_SEAT_COUNT`](../../client/src/table3d/layout.ts)).
  Their physics-pose ring is uniformly spaced around the full circle. HTML seat cards are
  independent: the lobby shows eight slots; active play shows occupied cards only and
  reflows them along the lower 2→10 o'clock arc.
- The scene, camera, and physics **never rotate**: every client simulates and renders in its own view space with the local player at the bottom (+Z). `DicePhysics` is seat-agnostic.
- Seat identity is applied to pose **data** at two boundaries ([`seatTransform.ts`](../../client/src/table3d/seatTransform.ts)): the roller canonicalizes outbound frames onto the fixed eight-seat ring (`poseFrameToCanonical`), then each viewer rotates the canonical frame to the originating player's shared occupied-card placement (`poseFrameForSeatDisplay`). `rotateBodyPoseY` is pinned to three.js rotation conventions by test — a rotated `<group>` around the scene was rejected because rapier bodies simulate in world space, so imperative teleports and declarative props ended up in different coordinate spaces (and the group also rotated the elliptical table itself).

Positions use world/table constants from [`layout.ts`](../../client/src/table3d/layout.ts), not viewport gutter projection.

### Interaction

- **Click-to-keep** on 3D dice during `selecting`. Any die may be toggled — including dice kept on earlier rolls of the same turn (released dice without a this-roll felt pose go to the center slots).
- **Clicking the parked koozie commits the keep set** — cup pull into koozie happens on **grab** (`pullUnkeptDiceIntoCup`, after the cup teleports onto the felt). A screen-space **grab guard** (`pointerBelowNearDockGuard`, anchored to `KOOZIE_NEAR_DOCK_GUARD_POINT` at the kept-rail die *bottoms*) gates both grab paths: cup grabs are honored only *below* that projection, so keep/unkeep clicks on the near rail always go to the die — this is what keeps the generous cup hit radii (`hitScreenPx`/`hitRadius`) safe next to the near dock, and it projects through the live camera so it holds at any canvas size.
- **Cursors:** `grab` on koozie hover (idle/selecting), `pointer` on selectable dice hover, `grabbing` while dragging. Handled via pointer enter/leave on [`KoozieBody`](../../client/src/table3d/dice/KoozieBody.tsx) and [`DieBody`](../../client/src/table3d/dice/DieBody.tsx).
- **Touch scrolling:** the page retains normal vertical scrolling until a koozie grab succeeds. During an active cup drag, a non-passive window `touchmove` listener cancels the browser's scroll gesture; release/cancel immediately restores ordinary page scrolling. Touches that miss the koozie are never canceled.
- **Teleport on grab** from `idle` or `selecting` when the koozie is outside play bounds — instant snap to a table-bounded point at the cursor; no dragging while off-table.

### UI

The old 2D `DiceRow` path was removed; 3D dice are the sole keep UI. Instruction copy lives
in [`GameArea.tsx`](../../client/src/components/GameArea.tsx) and the Playground hint bar.

## Rejected alternatives

| Alternative | Why not |
|-------------|---------|
| **Viewport left-gutter tray** | Kept dice and parked koozie floated in screen space off the felt; did not read as “on the table.” |
| **Pull dice into cup on grab** | Prevented hover/click-to-keep while dragging the koozie over felt dice. |
| **2D + 3D keep UI in parallel** | Redundant; the table uses the 3D keep UI only. |
| **Wire to production Room in same pass** | Playground is the only 3D dice consumer; props are shaped for later Room adoption. |

## Consequences

- `releaseSignal` remains unused; roll is pointer-driven.
- Spectators see a non-interactive parked koozie directly in front of the active player's reflowed card (`ParkedKoozie` in `TableCanvas`); only the roller can grab their local cup. The dock stays up for the whole turn except while the roller is controlling the cup (`remoteRoll.cupInPlay` from streamed `cupVisible: true`, or `turn.throwing`). Selecting-phase pose frames keep the remote feed "live" with `cupVisible: false` — do not gate the dock on `remoteFeed`/`live`, or it vanishes mid-turn.
- Fixed/locked bodies are placed **declaratively only** (position props, remounts via `layoutGen`); rapier skips mesh sync for sleeping fixed bodies, so imperative `setTranslation` on them moves physics without the visual. Imperative teleports remain only for dynamic dice mid-interaction (`pullUnkeptDiceIntoCup`) and the grabbed kinematic cup.
- **Follow-ups:** animated lerp instead of teleport.
- **2026-07-03 update:** production Room keeps the last settled table pose visible across turn switches and delays the round-end modal 3 seconds, so the final roll remains readable before winner reveal.
- **2026-07-17 update (central after-roll barrier):** the client-only round-end modal delay above
  was removed. Every normal roll and Yahtzee bonus die now arms one server-owned,
  room-configurable quiet window (default 2000ms). Settled dice still publish immediately, while
  transfers, celebrations, bonus offers/results, auto-stands, turn/sub-round transitions, pot
  awards, and the recap wait behind `turn:rollResolved` or the delayed bonus result. This keeps
  all three renderers synchronized and prevents snapshots/chip counts from revealing an outcome
  before the visual effect. The settled bonus die also remains visible through its quiet window.
  Crash replay skips wall-clock waiting but recomputes the same result. Ordinary non-terminal
  rolls are deliberately non-blocking for cup interaction: the koozie docks immediately and
  same-player rerolls may overlap pending quiet windows, whose dice/outcomes are snapshotted
  independently. Capped and enabled Yahtzee-transition rolls expose `turn.koozieLocked` in the
  immediate snapshot, and the local settle callback predicts that immutable lock synchronously,
  preventing the cup from flashing for one frame before it disappears. Bonus-die settlement
  always keeps it hidden; Stand remains blocked while any outcome is pending.
- **2026-07-18 update (recap-owned next-round handoff):** the final roll still completes its
  configured after-roll quiet window before `round:ended` reveals chips, effects, and the recap.
  After that reveal, the delay is not enforced again. Manual or 2.8s automatic recap dismissal
  sends the idempotent `round:continue` action from seated clients; the first request starts the
  next authoritative round immediately and transfers the koozie to its rotated first roller.
  Spectators may close their local modal but cannot advance the game. The prior 8s server timer
  remains only as a failure fallback for missing client dismissal messages.
- **2026-07-04 update:** a **Stand** button renders on the table frame gutter (outside the play area, like the parked koozie). Voluntary stands are gated by the shared `canStandVoluntarily` rule — blocked while the current hand loses to the roll-to-beat (ties allowed; they force the sub-round) — and the server enforces the same rule on `turn:stand` (`STAND_NOT_ALLOWED`). Forced stands (roll cap, keep-all, timeout/disconnect/kick) bypass the gate.
- **2026-07-07 update (table symmetry):** the felt became a **circle** (`FELT_SCALE` isotropic, guarded by a layout test). Seat identity is applied by rotating pose data around Y, and only a rotationally symmetric table maps onto itself under that rotation — on the old 1.15×0.95 oval, a remote roller's settled dice appeared on or past the rail in other players' views. Also: the previous turn's frozen pose now stays on the felt for the next roller **until they grab the koozie** (Room.tsx `showHeldPose` gates on dragging/rolling/dice; the idle sim's own dice are hidden in the docked cup, so the two never overlap). A captured pose is only shown if its top faces equal the authoritative last roll (`poseFrameMatchesDice` vs `turn:rolled`); otherwise a static pose is rebuilt from the roll values — per-client capture pipelines (local frames vs streamed frames) can be stale, and clients must never disagree on the faces.
- **2026-07-07 update:** the parked koozie moved off the felt to a **dock beyond the containment wall** behind the far rail (rim peeking over). The on-felt spot let dice settle against/under the parked cup, where the generous pickup hit-test stole their clicks (misclick = keep set committed). Pull-into-cup-on-grab alone was insufficient; the dock plus the **grab guard line** (above) makes far-rail dice always clickable by construction. On grab from the dock, `pullUnkeptDiceIntoCup` now includes dice already inside the cup (`includeCupDice`) so a mid-turn remount can't strand them outside the wall. The vestigial `KOOZIE.home`/`cup.homeZ` constants and the Playground `cupHomeZ` slider were deleted — `koozieRestPosition` is the single source of the parked position.
- **2026-07-09 update (seat-docked koozie):** the parked cup moved from the fixed far rail (−Z) to the **active player's display seat** so every viewer sees whose turn it is and the roller picks it up from in front of them. The near-camera bottom fringe cannot fit a fully raised cup at +Z without covering kept dice, so the cup stays **sunken** (`KOOZIE_DOCK_RIM_ABOVE_RAIL` peek) — seat-0 framing only requires the rim band on-screen. The far-rail grab guard was replaced by `pointerBelowNearDockGuard` so kept-rail keep-clicks stay above the docked cup's hit radii. Spectators get `ParkedKoozie` whenever they are not the roller and no remote throw is live; the roller still uses `DicePhysics`. `KoozieMesh` keeps the existing closed cylinder geometry but assigns its side and bottom opaque materials and its top cap an invisible material, so the visual reads as a solid open cup without changing physics or hit handling.
- **2026-07-15 update (spectator koozie follows the active card):** occupied seat cards reflow across the lower arc, but the static spectator cup previously used `displaySeatIndex` and the fixed eight-seat pose ring. On sparse tables that put the cup beside, rather than directly in front of, the throwing player's card. This first fix moved `ParkedKoozie` to the occupied-card angle; the 2026-07-16 update below supersedes its one-off mapping with the shared presentation placement used by every spectator visual.
- **2026-07-11 update (animated chip pot):** active-play Pot/Round text was removed from the felt. The pot is now an exact, automatically scaled gold-coin pyramid in the reserved top band's left lane, with roll-to-beat in the right lane; lobby room/waiting text remains on the felt. Chips animate on a pointer-transparent DOM canvas from each measured player-name target to the pot on `round:started` / `subround:started`, then the complete `potWon` tower moves to the winner on `round:ended`. These one-shot visuals use the table event bus and live outside all three dice renderers, so roller, spectator, and static views share one implementation. Reduced-motion clients apply the authoritative snapshot without travel.
- **2026-07-11 update (turn-owned keeps):** pending keep selection is now scoped to the exact active player/roll version and resolved synchronously during render. Previously, the incoming roller could mount `DicePhysics` for one frame with the outgoing turn's keeps plus the new turn's empty dice array; the kept branch rendered those value-less bodies on the near rail with identity rotation, producing extra face-1 dice alongside the correct static previous hand. `buildRuntime` now independently rejects keep indices without committed values, so the handoff fails closed even if a caller passes stale input.
- **2026-07-11 update (top-band bleed):** ante pot / roll-to-beat / Classic Pot are HUD chrome, not an occluder. Two earlier shapes were rejected: an opaque-gutter band (clipped a raised koozie at the canvas's top edge) and removing the gutter entirely (pushed the table against the page top — the vertical space is wanted). The shipped design keeps the band row (`--table-top-band-h`) but makes it playing field: the transparent canvas (`gl alpha: true`, no scene background color) bleeds up over the row (`.table-canvas` negative top) and `FixedCamera` extends the frustum upward with a matching `setViewOffset` (`frameViewOffset` in `project.ts`, alignment test-pinned) so the virtual 16:9 frame stays exactly the viewport rect — framing tests, seat overlays, and pointer picking are untouched. `.table-top-band` stacks **under** the canvas (`z-index: 0` vs the viewport's `1`), so widgets show through empty pixels while a koozie raised into the top arc paints over them. Invariants: band stays `pointer-events: none`; the Canvas camera stays `manual` (r3f resize would overwrite aspect + view offset); fog color (`theme.background = #14191f`) must equal the page `--bg` or the felt's horizon fade seams against the page. Stacked (≤640px) mode zeroes `--table-top-band-h`, killing the bleed. `SEAT_VIEW` was also pulled back slightly so far-seat docked koozies clear the top of the virtual frame. A legacy pointerdown aspect resync in `DicePhysics` (camera.aspect ← canvas w/h) was removed — it silently rezoomed the roller's projection once the canvas stopped being 16:9; nothing outside `FixedCamera` may write the projection.
- **2026-07-14 update (Yahtzee sixth die):** bonus mode preserves the complete five-die Yahtzee on the kept rail and temporarily adds die index 5 inside the cup. The local physics runtime and ephemeral `dice:frames` stream may therefore contain six dice only during that throw; authoritative hand/rest-pose state remains five dice. `RemoteDiceView` owns a normally hidden sixth mesh so spectators see the same throw. The temporary body is removed on settle, after its face is reported, and the engine auto-stands the roller on the untouched quint.
- **2026-07-15 update (short desktop viewports):** desktop table sizing now uses the
  browser's live `visualViewport.height` (falling back to `innerHeight`) as a second
  constraint. `viewportFit.ts` mirrors the frame's fixed band/border/gutter CSS and caps
  the complete frame width so the top band, 16:9 canvas, and lower seat arc fit above the
  browser chrome. The canvas ratio, fixed camera, world framing, and measured seat
  placement are unchanged. Stacked mode remains width-triggered at 640px and flows seats
  below the canvas as before.
- **2026-07-15 update (eight seats + occupied-card reflow):** room capacity is fixed at
  eight and no longer appears in room settings. Lobby cards expose all logical slots;
  playing/round-end cards contain occupied seats only and redistribute whenever a seat is
  approved, kicked, or forfeited. Canonical pose transforms deliberately remain on a
  separate, uniform eight-seat full circle so reflow cannot change wire or persisted dice
  coordinates; render-time presentation follows occupied-card reflow.
  Every dock is framing-tested; the fixed camera was pulled back and aimed slightly nearer
  center, and the docked rim was raised while staying sunken behind the apron so all eight
  active-seat markers remain readable.
- **2026-07-15 update (local card at 6 o'clock):** display slot 0 is pinned directly below
  the local koozie at 6 o'clock for every occupied count. Later slots follow clockwise
  throwing order to 10 o'clock, wrap across the reserved top gap, and continue from 2
  o'clock. Remote cards consume the full lower arc, so a two-player view uses 6 and 10
  rather than placing the players beside each other.
- **2026-07-16 update (single player-relative placement):** the earlier spectator-koozie
  fix aligned only the parked cup to the reflowed active card; streamed and static dice
  still localized through the fixed logical ring, so kept dice appeared at another rail
  position and the cup jumped when picked up. `SeatDisplayPlacement` is now the shared
  presentation source for the card, parked cup, full streamed throw, authoritative rest
  pose, and slot fallback. Canonical wire/persisted poses remain on the uniform ring;
  `poseFrameForSeatDisplay` rotates the complete frame only at render time.

## Verification

- `npm run check` && `npm test`
- Playground `/playground`: roll → koozie in front of you → click dice to rail → unkeep restores felt pose (or center slots for prior-roll keeps) → click koozie → drag → release re-rolls unkept only; switch view to a spectator and confirm the parked cup sits at the active seat and is not clickable

## See also

- [002 — Rapier physics stack](./002-rapier-physics-stack.md)
