# Multi-tab browser testing

Manual verification for **Phase 7** (client foundation) and **Phase 8** (lobby UI). Run these after changes to `client/`, the WebSocket client, or room join/rejoin logic.

Browser verification is user-owned by default. Agents must finish implementation and
automated checks first, then hand the relevant checklist to the user. **Agents must not
launch or drive the Cursor browser MCP (or any other browser test) unless the user
explicitly asks them to do so.**

---

## Dev stack prerequisites

1. **One clean dev stack** — stale Vite instances cause port drift (5174, 5175) and broken proxies.

   ```bash
   # Kill anything on the usual ports, then:
   npm run dev
   ```

2. **Confirm before testing:**
   - Client: `http://localhost:5173`
   - Server health via proxy: `curl http://localhost:5173/health` → `{"ok":true,...}`
   - WebSocket via proxy: connects to `ws://localhost:5173/ws`

3. **Wait for the socket** — poll until the page shows **`Connection: open`** (`[data-connection="open"]`). Do not click **Create room** while status is `connecting` or `closed`; the button stays disabled until `open`.

4. **Unit tests are not enough** — `npm test` does not cover multi-tab UI. Run the flows below before marking Phase 7/8 verification done.

---

## localStorage & multi-tab identity

Tabs in the **same browser profile share `localStorage`**.

| Key | Purpose |
|-----|---------|
| `dice:name` | Display name |
| `dice:room:<roomId>` | `{ playerId, rejoinToken, playerName }` for reconnect |

**Important:** Rejoin only happens when the stored `playerName` matches the current display name. A second tab with `dice:name = "Bob"` will **not** steal Alice's seat/token.

**Simulating distinct players in multiple tabs:**

```js
// In tab B (via CDP Runtime.evaluate), before navigating to the room:
localStorage.setItem('dice:name', 'Bob');
// Do NOT clear dice:room:<id> unless you intend to force a fresh join.
location.href = 'http://localhost:5173/room/<ROOM_ID>';
```

To test a completely fresh second player: `localStorage.clear()` in that tab only, enter the
new name on Home, then click the active room.

**Avoid reloading the host tab during tests** — a reload disconnects the host briefly and can trigger **host transfer** to a seated player or spectator, invalidating host-only steps.

---

## Phase 7 — Client foundation (2 tabs)

**Goal:** Create/join a room and watch authoritative snapshots update live.

### Tab A (host)

1. Open `http://localhost:5173/`. Wait for **`Connection: open`**.
2. Enter name **Alice**. Click **Create room**.
3. On the **Room created** screen, note the 6-character code and invite URL. Click **Enter room →** (or navigate to `/room/<code>`).
4. Expand **Room snapshot (debug)**. Confirm JSON `players` contains `"name": "Alice"`.

### Tab B (second player)

5. Set `localStorage.setItem('dice:name', 'Bob')`, then open home `http://localhost:5173/`.
6. Confirm Alice's room appears with her name and **Lobby**, then click it. (You can still go
   directly to `/room/<code>` after setting the name.)
7. Confirm Tab B snapshot lists **both** Alice and Bob in `players`.

### Tab A (live update)

8. Re-snapshot Tab A. Confirm Bob appears without reloading.

### Unknown room

9. In Tab B, navigate to `http://localhost:5173/room/ZZZZZZ`.
10. Confirm **Room not found** and a link back home.

11. Keep Home open in a third tab, then close both room tabs. Home should omit the room on its
    next five-second refresh. The room itself remains recoverable by direct URL for 30 minutes,
    after which the reaper deletes it.

**Pass criteria:** Each step above succeeds; the room directory reflects live players/rounds;
no console errors; connection stays `open`.

---

## Phase 8 — Lobby UI (3 tabs)

**Goal:** Full pre-game flow — seats, approve/deny, kick, settings, host transfer.

Use room code `<CODE>` from Tab A. Steps assume Alice = host.

### Tab A — Alice (host)

1. Home → wait **`Connection: open`** → name **Alice** → optional **Customize settings** (e.g. min buy-in 20) → **Create room**.
2. **Room created** screen shows code + copyable invite URL. **Enter room**.
3. Lobby: oval table, room code center, **Copy invite link**, **Start game** disabled (<2 seated). Alice in **Spectators** with host ★.
4. **Take a seat** → buy-in within bounds → **Request seat** → auto-approved as host. Alice on table with chips + ★ + green connection dot.

### Tab B — Bob

5. `localStorage.setItem('dice:name', 'Bob')` → Home → confirm Alice and **Lobby** are listed →
   click the room.
6. Confirm Bob is a **spectator** (not Alice) in both tabs.
7. Request seat (e.g. buy-in 50) → Tab B shows **Waiting for the host**.
8. Tab A: **Seat requests** panel + toast → **Approve** → Bob seated in both tabs → **Start game** enabled on Tab A.

### Tab C — Carol

9. `localStorage.setItem('dice:name', 'Carol')` → join room → request seat (e.g. 30).
10. Tab A: **Deny** → Tab C toast **Your seat request was denied** → **Take a seat** form returns (not stuck pending).
11. Carol requests again; host **Approve** → Carol seated.

### Kick

12. Tab A: **Kick** on Carol's seat → Tab C: toast **You were kicked from your seat**, spectator + **banned** badge, cannot request seat.

### Settings

13. Tab B: **Room settings** → all fields disabled (read-only), with no configurable
    max-player field in either tab.
14. Tab A: change **Starting chips per round** (e.g. 2) → **Save settings** → Tab B read-only panel shows updated value.
14b. After the game has started (mid-round): Tab A host opens **Room settings**, changes **Starting chips per round** (e.g. 4) → **Save** → Tab B shows the new value immediately; the **current** pot is unchanged. On the **next** round, both players ante the corresponding effective amount.
14c. Set **After Roll Delay (ms)** to 3000 mid-game. The next settled roll stays quiet for
    about 3 seconds before any payout/effect/turn change. Change it to 500 during that quiet
    window: the current roll still waits about 3 seconds; the following roll waits about 0.5s.
    On an ordinary roll, confirm the koozie docks immediately and can be grabbed for a rapid
    reroll during the quiet window. On a capped roll or a roll that starts a Yahtzee bonus,
    confirm the koozie stays hidden continuously—there must be no one-frame flash at the
    player's dock before the delayed turn/bonus transition.

### Host transfer

15. **Close Tab A** (host). Within a few seconds on Tab B: toast **You are now the host** (or “Bob is now the host”), host ★ on Bob's seat, host controls visible.

### Console

16. Check browser console in Tabs B and C — no errors.

**Pass criteria:** All checkpoints pass; layout readable (seats not overlapping); no console errors.

---

## Chat + game log — 3 tabs

1. With Alice, Bob, and Carol in one room, send a chat message from each tab. Confirm the
   floating chat contains only player messages and its unread badge increases only for those
   messages—not for joins, kicks, rolls, or payouts.
2. Seat Alice and Bob, note Alice's chips, and send from Alice. Start a round or trigger a
   payout so Alice's stack changes, then send again. Both tabs must show the original chip
   count beside the first message and the new count beside the second.
3. Trigger membership and game events (join, kick, forfeit, round result, or side payout).
   Confirm they appear in **Game log** immediately above **Room settings** and never appear in
   chat. The log should be collapsible and display timestamps.
4. After more than ten activity entries, expand **Game log**. Confirm it starts with the newest
   ten in chronological order and **Show 10 more** reveals older entries without losing the
   newer ones.
5. Refresh/rejoin one tab. Player chat history, including chip snapshots, must replay without
   duplicates; entries written before chip snapshots may omit the count. Check all consoles for
   errors and repeat once at ≤640px to confirm chat remains a bottom sheet while the log stays in
   normal page flow above settings.

---

## Eight-seat capacity + in-game reflow — 3 tabs

1. In Tab A, create a room and seat Alice. In Tab B, join and seat Bob. Before starting,
   confirm the table exposes all eight logical slots and settings have no max-player field.
2. Start the game. In each player's own tab, confirm their card is directly below the
   koozie at 6 o'clock and the opponent is far away at 10 o'clock. The six empty cards
   disappear immediately, and no card enters the reserved top band.
3. During play, join in Tab C as Carol and request a seat. Tab A approves it. Confirm Carol's
   card appears immediately in all tabs and the three occupied cards reflow without overlap.
   Carol must not interrupt the current turn; she joins turn order at the next round.
4. Kick Carol (or let a disconnected seat forfeit) and confirm her card disappears and the
   remaining cards reflow. At ≤640px, repeat steps 2–3 and confirm only occupied cards appear
   in the stacked strip.
5. Check all consoles for errors. Before each throw, confirm every non-roller tab pins the
   parked koozie directly in front of the active player's card (including the sparse
   two-player 6/10 layout). Keep a die, then grab and reroll: the kept rail, parked cup,
   live streamed cup/dice, and settled static hand must all stay on that same player's side
   with no jump when the cup is picked up. Repeat from an unseated spectator view. Confirm
   every tab agrees on the settled dice position and the koozie remains in frame.

**Pass criteria:** Lobby capacity is eight, active play shows occupied cards only, mid-game
approval/removal reflows correctly, the spectator koozie follows the active card, and the
top HUD arc stays seat-free.

---

## Touchscreen koozie drag — 2 tabs

1. Use a touch device (or DevTools touch emulation) for the active roller in Tab A and
   keep a spectator open in Tab B.
2. In Tab A, swipe vertically on an empty part of the table and confirm the room page
   scrolls normally.
3. Touch the koozie and drag vertically. Confirm the koozie follows the finger while the
   page stays fixed, then release to throw.
4. After release, swipe the empty table again and confirm page scrolling is restored.
5. Touch near—but outside—the koozie and drag. Confirm the page scrolls and the koozie
   does not move. Check both tabs for console errors and confirm Tab B sees the throw.

---

## Short desktop viewport / Chromebook — 2 tabs

1. Use a desktop-width viewport with reduced usable height (for example 1366×650 CSS
   pixels). Start a game with one player in each tab.
2. Without scrolling, confirm the complete table frame is visible: all three seat cards
   include their chip counts, and the Pot / Roll to beat / Classic Pot band is visible.
3. Resize the browser shorter and taller. The complete frame should narrow and widen while
   the table remains circular, the canvas remains 16:9, and no seat overlaps the top band.
4. Roll once from each player. Confirm the roller, spectator, and between-turn static view
   keep the same framing and that koozie/die pointer interaction still aligns visually.
5. At 640px wide or below, confirm the existing stacked seat strip still flows below the
   canvas and scrolls normally; the height-fit cap must not apply there.

---

## Forcing straights — payout + celebration glow

Dice come only from client physics (no server RNG), so the settle override in
`DicePhysics.tsx` is the way to force a straight:

1. In the **roller's** tab console (dev builds only):
   `window.__forceSettleFaces = [1, 2, 3, 4, 5]` (or `[2, 3, 4, 5, 6]`).
   Kept dice keep their committed values, so force on the **first** throw of a turn.
2. Grab and throw the koozie. On settle, the dice remain plain and chip counts do not move for
   the configured After Roll Delay (2s by default). Then they light up gold **one-by-one in
   ascending face order** (~1.6s, then fade). Grabbing the cup again clears it early.
3. At that same delayed boundary: `straight:paid` toast, every other seated player's chips drop by the
   configured amount, roller's rise — pot unchanged, turn continues.
4. Spectator tab (streamed playback or passive view) shows the same staggered glow
   shortly after the dice snap into place.
5. `delete window.__forceSettleFaces` to return to real physics faces.
6. Reduced motion (DevTools → Rendering → emulate `prefers-reduced-motion: reduce`):
   all five glow together steadily instead of staggering.

Also testable offline at `/dev/play` (Playground) — the local roller path uses the
same override; switch **View as** to check the passive glow.

---

## Classic Pot — 2 tabs

1. Confirm Classic Pot is enabled in settings (default on; donation amount 1).
2. On the first throw of a turn, force four of a kind (e.g.
   `window.__forceSettleFaces = [3, 3, 3, 3, 2]`). After the configured delay: roller loses 1 chip, Classic
   Pot (top-band right of roll-to-beat) increments, toast/game log announce the donation, and a
   chip flies seat → Classic Pot.
3. Yahtzee on first roll (`[4,4,4,4,4]`) must **not** donate. A four-of-a-kind on the second
   roll of a turn must **not** donate.
4. With Classic Pot > 0 and nobody stood yet this round, force three 6s on the **first**
   throw of a turn (`[6,6,6,2,3]` or `[6,6,1,2,3]`). Roller collects the Classic Pot; pool
   zeros; chip flies Classic Pot → seat. Three 6s on a second/third throw of the same
   turn must **not** win it.
5. After someone stands (roll-to-beat set), first-roll three 6s on a later turn must
   **not** win the Classic Pot.
6. Disable Classic Pot in settings mid-game with a non-zero pool: no further donations or
   wins; the frozen balance stays visible until re-enabled.

---

## First-roll Yahtzee payout + bonus sixth die — 2 tabs

1. Confirm **First-roll Yahtzee payout** and Yahtzee bonus are enabled. In the roller tab, force
   a first-throw quint with
   `window.__forceSettleFaces = [6, 6, 6, 6, 6]`, then throw the koozie.
2. After the main roll's configured delay, every other seated player's chips fall by the effective first-roll amount,
   the roller's chips rise by the same total, and both tabs show the transfer toast/game-log line.
   Repeat with `[6, 6, 6, 1, 1]` to confirm wild-composed Yahtzees qualify; a Yahtzee made on a
   second roll must not pay this rule.
3. When the bonus is offered, confirm **all five** Yahtzee dice move to/stay on the rail
   and a separate sixth die is inside the koozie. No hand die may disappear or move into
   the cup.
4. Throw the bonus die. The spectator must see all five railed dice plus the streamed
   sixth die during the throw.
5. On settle (match or miss), confirm there is no match/miss announcement, chip movement, or
   automatic stand until the bonus die's configured delay elapses. Then the original five-die
   Yahtzee remains as the last hand, and the roller stands automatically without clicking
   **Stand**. The next player's turn should begin (or the round should resolve).
6. Repeat from the other player seat and check both consoles for errors or
   `[dice] slot-layout fallback` warnings. Then `delete window.__forceSettleFaces`.

---

## Stake multiplier + auto-raise — 2 tabs

Use **Every N rounds = 1** so each completed round exercises a raise boundary quickly.
Keep the starting ante at 1 and first-roll Yahtzee payout at 4.

1. Create a room with **Bet multiplier = 1**, seat two players, and start. Confirm the
   round-1 ante is 1 per player. Force a first-roll Yahtzee and confirm its payout is 4 per payer.
2. Finish/dismiss round 1. Confirm the round-2 ante is 2 per player. Force another first-roll
   Yahtzee and confirm its payout is 5 per payer. Both tabs must show **Auto-raise: all bets
   increased by 1 chip for round 2**. The settings panel must still label/show the editable
   starting amounts as ante 1 and payout 4.
3. Repeat in a fresh room with **Bet multiplier = 2**. Confirm round 1 uses ante 2 and
   first-roll payout 8; round 2 uses ante 4 and first-roll payout 10, with a notification that
   all bets increased by 2 chips.
4. Disable auto-raise in another fresh multiplier-2 room. Confirm the initial scaling remains
   (ante 2 / first-roll payout 8) but round 2 does not add another step.
5. On both tabs, confirm the exact effective amounts appear in ante and payout activity lines,
   chip totals remain conserved, and neither console reports errors.

---

## Animated chip pot — 2–3 tabs

1. In the lobby, confirm the room code and “waiting to start” still render on the felt.
2. Seat 2–3 players and start the game. On every tab, one gold coin per paid chip travels
   from each contributing player's name to a pyramid left of roll-to-beat. A pot of 3 must
   show two coins on the bottom and one above.
3. During play, confirm no Pot/Round text remains on the felt. Roll-to-beat, Classic Pot,
   Stand/hint, player names, and the below-table HUD remain unchanged.
4. Force matching hands on every turn to start a sub-round. Confirm only tied players send
   chips and everyone sends the equal short-stack floor, not the nominal sub-round ante when
   a tied player is short.
5. Finish a round with a winner. The complete pot tower must leave the pot lane, slide to
   the winner's name on every tab, and disappear; the next round's ante then builds a fresh
   tower. If every player forfeits without a roll, confirm the tower stays put for the
   carryover because there is no winner.
6. At ≤640px, repeat an ante and award with the stacked seat strip. Flights must start/end
   at the visible names without horizontal scrolling.
7. Refresh/rejoin a spectator mid-round: it should immediately see the authoritative static
   pot and must not replay an old ante. Emulate `prefers-reduced-motion: reduce`: chip counts
   update without travel.
8. `/dev/play` offers **Replay ante** and **Replay pot award** for checking each fixture's pot
   size and all three viewer orientations without advancing a server game.

---

## Settled dice rest pose (ADR 005) — 2 tabs + throttling

Verifies every viewer sees the dice **where they physically landed**, never the
center-line slot layout. Setup: tabs A (host, seated) and B (seated), game started.
**Watch both DevTools consoles throughout** — `[dice] slot-layout fallback` must not
appear except where marked *expected*; `window.__diceDebug.slotFallbackCount` exposes a
running counter.

1. **Roll:** A rolls. After settle, both tabs show the identical scatter (B sees it
   rotated to A's seat) — not five dice in a line across the table's center.
2. **Keep + reroll:** A keeps 2 dice and rolls again. Both tabs: kept dice sit at A's
   rail edge, the rest scattered where they landed.
3. **Unkeep prior keep:** A keeps 1 die, rolls again, then clicks that previously kept
   die to release it. It moves near the table center (no this-roll felt pose). A keeps
   newly rolled faces instead, throws again — the released index is re-rolled (new face).
4. **Turn switch with keeps:** A keeps 4 dice, completes the hand, then stands. While B
   idles pre-roll, both tabs still show A's final layout unchanged and **exactly 5 dice
   total**. B must not get an additional near-rail row of 4 face-1 dice. When B grabs the
   koozie, A's held pose hides and B's own dice proceed through the normal throw flow.
5. **Losing hand + round end:** establish a roll to beat, then let the next/final roller
   lose. Both tabs keep that newest losing layout on the felt (never the earlier winning
   hand), leave it unobstructed for the configured After Roll Delay (2s by default), then show
   the winner recap and pot movement together. Dismiss the recap early in one seated tab:
   both tabs must enter the next round immediately, and the new first roller's koozie must
   appear without another After Roll Delay. Repeat using the 2.8s auto-dismiss. A spectator
   dismissing their own recap must not advance the room.
6. **Last-player beat auto-stand:** with a roll-to-beat set, the final roller beats it (not
   merely ties). Both tabs: koozie stays locked during the After Roll Delay; no further keep
   / throw is possible; after the delay the roller stands automatically without clicking
   **Stand**, and the round resolves to them as winner. A mere tie must still allow another
   throw when rolls remain under the cap.
7. **Spectator refresh:** refresh B while A is selecting. B rejoins straight into A's
   real layout (snapshot `restPose`) — this used to be a guaranteed fallback.
8. **Roller refresh:** refresh A after a settle, before standing. A rejoins seeing its
   own real layout.
9. **Late joiner:** open a third tab as a spectator after a roll — real layout on join.
10. **Lossy stream:** DevTools → Network → throttle B to Slow 3G during A's throw. The
   live animation may stutter, but after `turn:rolled` B snaps to the correct settled
   layout (the pose rides the message, not the stream).
11. **Crash recovery:** restart the server mid-round after a roll; when both tabs
   reconnect the layout is restored from the event log.
12. **Fresh round (fallback *expected*):** at a new round before any roll, a lingering
    `rollToBeat` with no pose may render slot layout + one dev warn — legitimate.
13. **Dev face override (fallback *expected*):** with `window.__forceSettleFaces` set,
    the reported values disagree with the physics pose, so the client omits it, the
    server would drop it anyway, and viewers get the slot layout.

---

## Audio — by-ear checklist, 2 tabs

Setup: tabs A (roller) and B (spectator/other seat), game started, system volume up.
Sounds only start after a tab's first click/keypress (browser autoplay policy).

1. **Roller impacts (A):** grab the koozie and shake — a continuous rattle whose
   loudness tracks how hard you shake; stop moving and it dies away. **Hold the koozie
   perfectly still: total silence** (resting dice must not rattle). Pour: dice
   tumbling out produce felt thuds and die-on-die clacks scaled by impact; a die
   reaching the rail gives a distinct softer knock. After settle: true silence (no
   residual ticking from resting dice).
   In B, an opponent's stand / keep-selection must be silent — dice snapping to the
   rail are repositions, not impacts.
2. **Stereo pan (A):** throw dice hard left, then hard right — the impacts audibly
   shift channels.
3. **Spectator (B):** during A's throw, B hears the shake rattle and landing impacts
   roughly in sync with its (slightly delayed) visuals. Between turns — static dice —
   B is silent.
4. **Autoplay unlock (B):** open a fresh third tab, join, and don't click anywhere:
   A's next throw is silent there with no console errors. Click once; the following
   throw is audible.
5. **One-shots:** round ante → chip-stack sound once per tab (not doubled); round win →
   chip payout sound; a straight → bell, together with the glow.
6. **Volume control:** HUD Sound cell — global mute silences everything instantly. The Effects
   slider scales dice/cup/chip/built-in sounds without changing player recordings; the Player
   recordings slider does the inverse. Both survive a reload (`localStorage['dice:audio']`). A hidden tab
   goes silent (switch away during a shake) and comes back on focus.
7. **Calibration (optional):** `localStorage.setItem('dice:audio-debug', '1')` in A's
   console logs `[audio] <pair> force=…` per contact — use it to tune
   `AUDIO_TUNING.impact` if thuds feel too eager/shy.
8. **Record on Home:** before joining, open **Special moment recordings** and confirm rows for
   Straight, Classic, First-roll Yahtzee, Yahtzee bonus match, and Overtime win. Record a short
   Straight clip, stop before (or at) the automatic 3s cap, preview it, reload, and confirm it
   remains. Denying microphone permission must show a useful error without breaking the page.
9. **Share the roller's clip:** join/start in both tabs and make at least one gesture in each to
   unlock audio. Force A's straight. After the quiet window, both A and B hear A's recording
   instead of the built-in straight bell; normal chip sounds still play. Set B's Player recordings
   slider to zero and repeat: B hears effects but not A's clip.
10. **Update live:** re-record A's Straight clip from the in-room editor, then force another
    straight on A's next turn. Both tabs hear the replacement without reload. Remove it and force
    again; both fall back to the built-in bell.
11. **Device-wide, name-independent:** leave the room, change `dice:name`, and revisit Home. The
    same five-slot pack remains available because it is keyed to the browser/site, not username.
12. **Zero-chip and overtime triggers:** with Straight enabled and amount 0, a qualifying straight
    still plays the recording. Force a tie, then resolve its tie-breaker: the winning player's
    Overtime win recording plays once. A normal round win never plays that slot.

---

## UI selectors & automation tips

| What | How to find |
|------|-------------|
| Connection status | Text `Connection: open` or `[data-connection="open"]` |
| Snapshot JSON | `.snapshot-debug` inside open **Room snapshot (debug)** |
| Min buy-in (create form) | `#set-minbuyin` |
| Seat request buy-in | `.seat-request input[type="number"]` |
| Approve / Deny | Buttons in `.host-panel` |
| Kick | `.kick-button` on seat card |

**Number inputs:** Prefer `browser_fill` on spinbuttons. Raw CDP `input.value = …` does **not** update React state for controlled fields.

**Polling:** After navigation or seat changes, wait up to ~5s for `Connection: open` and snapshot content before failing a step.

---

## Known pitfalls (debugging)

| Symptom | Likely cause |
|---------|----------------|
| **Create room** disabled | WS not `open` yet, or name field empty |
| `Connection: closed` stuck | Multiple dev stacks; restart clean on 5173/3001 |
| Second tab joins as first player | Old bug: rejoin without name check — fixed via `playerName` on stored identity |
| Host panel missing seat request | Host tab stale; avoid unnecessary reloads. If needed, reload host tab once after request |
| Host transfer mid-test | Host tab closed/reloaded — restart test with stable Tab A |
| Tests on wrong port | Vite fell back to 5174/5175 — kill stale processes, use **5173** |

---

## Client architecture notes (for agents)

- **WebSocket:** `client/src/ws/singleton.ts` — one socket per page load; not closed on React StrictMode remount.
- **Connection UI:** `client/src/components/ConnectionStatus.tsx`
- **Debug snapshot:** `Room` page — `<details open>` with `.snapshot-debug` (Phase 7 verification + debugging).
- **Rejoin:** `client/src/state/persist.ts` + `Room.tsx` — token used only when `stored.playerName ===` current display name.

When changing join/reconnect behavior, re-run **both** Phase 7 and Phase 8 flows above.
