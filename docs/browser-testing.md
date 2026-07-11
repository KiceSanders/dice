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

To test a completely fresh second player: `localStorage.clear()` in that tab only, set the new name, then join from home with the room code.

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
6. Enter room code, click **Join** (or go directly to `/room/<code>` after setting the name).
7. Confirm Tab B snapshot lists **both** Alice and Bob in `players`.

### Tab A (live update)

8. Re-snapshot Tab A. Confirm Bob appears without reloading.

### Unknown room

9. In Tab B, navigate to `http://localhost:5173/room/ZZZZZZ`.
10. Confirm **Room not found** and a link back home.

**Pass criteria:** Each step above succeeds; no console errors; connection stays `open`.

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

5. `localStorage.setItem('dice:name', 'Bob')` → join `/room/<CODE>`.
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

13. Tab B: **Room settings** → all fields disabled (read-only).
14. Tab A: change **Chips per round** (e.g. 2) → **Save settings** → Tab B read-only panel shows updated value.
14b. After the game has started (mid-round): Tab A host opens **Room settings**, changes **Chips per round** (e.g. 4) → **Save** → Tab B shows the new value immediately; the **current** pot is unchanged. On the **next** round, both players ante the new amount.

### Host transfer

15. **Close Tab A** (host). Within a few seconds on Tab B: toast **You are now the host** (or “Bob is now the host”), host ★ on Bob's seat, host controls visible.

### Console

16. Check browser console in Tabs B and C — no errors.

**Pass criteria:** All checkpoints pass; layout readable (seats not overlapping); no console errors.

---

## Forcing straights — payout + celebration glow

Dice come only from client physics (no server RNG), so the settle override in
`DicePhysics.tsx` is the way to force a straight:

1. In the **roller's** tab console (dev builds only):
   `window.__forceSettleFaces = [1, 2, 3, 4, 5]` (or `[2, 3, 4, 5, 6]`).
   Kept dice keep their committed values, so force on the **first** throw of a turn.
2. Grab and throw the koozie. On settle: dice light up gold **one-by-one in
   ascending face order** (~1.6s, then fade). Grabbing the cup again clears it early.
3. Same roll: `straight:paid` toast, every other seated player's chips drop by the
   configured amount, roller's rise — pot unchanged, turn continues.
4. Spectator tab (streamed playback or passive view) shows the same staggered glow
   shortly after the dice snap into place.
5. `delete window.__forceSettleFaces` to return to real physics faces.
6. Reduced motion (DevTools → Rendering → emulate `prefers-reduced-motion: reduce`):
   all five glow together steadily instead of staggering.

Also testable offline at `/dev/play` (Playground) — the local roller path uses the
same override; switch **View as** to check the passive glow.

---

## Animated chip pot — 2–3 tabs

1. In the lobby, confirm the room code and “waiting to start” still render on the felt.
2. Seat 2–3 players and start the game. On every tab, one gold coin per paid chip travels
   from each contributing player's name to a pyramid left of roll-to-beat. A pot of 3 must
   show two coins on the bottom and one above.
3. During play, confirm no Pot/Round text remains on the felt. Roll-to-beat, Stand/hint,
   player names, and the below-table HUD remain unchanged.
4. Force matching hands on every turn to start a sub-round. Confirm only tied players send
   chips and a short stack sends its actual all-in amount, not the nominal sub-round ante.
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
5. **Spectator refresh:** refresh B while A is selecting. B rejoins straight into A's
   real layout (snapshot `restPose`) — this used to be a guaranteed fallback.
6. **Roller refresh:** refresh A after a settle, before standing. A rejoins seeing its
   own real layout.
7. **Late joiner:** open a third tab as a spectator after a roll — real layout on join.
8. **Lossy stream:** DevTools → Network → throttle B to Slow 3G during A's throw. The
   live animation may stutter, but after `turn:rolled` B snaps to the correct settled
   layout (the pose rides the message, not the stream).
9. **Crash recovery:** restart the server mid-round after a roll; when both tabs
   reconnect the layout is restored from the event log.
10. **Fresh round (fallback *expected*):** at a new round before any roll, a lingering
    `rollToBeat` with no pose may render slot layout + one dev warn — legitimate.
11. **Dev face override (fallback *expected*):** with `window.__forceSettleFaces` set,
    the reported values disagree with the physics pose, so the client omits it, the
    server would drop it anyway, and viewers get the slot layout.

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
