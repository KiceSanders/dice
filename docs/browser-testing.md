# Multi-tab browser testing

Manual verification for **Phase 7** (client foundation) and **Phase 8** (lobby UI). Run these after changes to `client/`, the WebSocket client, or room join/rejoin logic.

Use the Cursor **browser MCP** (`cursor-ide-browser`) or a normal browser with multiple tabs.

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
   `window.__forceSettleFaces = [1, 2, 3, 4, 5]` (or `[2,3,4,5,6]` for big).
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
