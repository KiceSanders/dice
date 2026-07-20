# Multiplayer Dice Game — Development Phase Log

A real-time, browser-based dice game for 2–8 seated players per room (plus spectators).
Players roll 5 dice per turn via a physics-simulated cup, keeping and re-rolling to beat the
roll-to-beat; the round winner takes the pot. Ties trigger doubled-bet sub-rounds; straights
trigger an instant side payment from every other seated player.

**This file is the phase/progress log only.** The canonical references live in `docs/`:
[GAME_RULES.md](./docs/GAME_RULES.md) (rules) · [PROTOCOL.md](./docs/PROTOCOL.md) (wire
contract) · [ARCHITECTURE.md](./docs/ARCHITECTURE.md) (structure + data flow) ·
[CODING_GUIDELINES.md](./docs/CODING_GUIDELINES.md) (conventions). Where phase text below
disagrees with those docs, the docs win — completed phases are left as written for history.

Work through phases **in order**. Check off tasks (`[x]`) as you complete them. Every phase
ends with a **Verification** step — do not move on until it passes.

---

## Architecture Overview

```
┌─────────────┐        WebSocket (JSON messages)        ┌──────────────────┐
│ React client │ ◄─────────────────────────────────────► │ Node.js server   │
│ (Vite, TS)   │        HTTP (static assets in prod)     │ (express + ws)   │
└─────────────┘                                          └────────┬─────────┘
                                                                  │ append-only
                                                                  ▼ event logs
                                                          server/logs/<roomId>.log
```

- **Server** (`server/`): Node.js + TypeScript. `express` serves the built client in production; `ws` handles real-time messaging. All game state lives in memory in a `RoomManager`. Every state-changing event is appended to a per-room log file (JSON Lines) so rooms can be recovered after a restart.
- **Client** (`client/`): React 19 + TypeScript + Vite. Connects to the server via a single WebSocket. State is held in a reducer keyed off server-pushed snapshots.
- **Shared** (`shared/`): TypeScript package containing all types, the WebSocket message protocol, and **pure game logic** (dice scoring, comparisons, straight detection, bonus math). Both client and server import it. Game logic must be pure functions — no I/O, no randomness inside scoring/comparison (randomness is injected).

### Repository layout

```
dice/
├── PLAN.md                 ← this file
├── README.md
├── package.json            ← npm workspaces root
├── shared/
│   └── src/
│       ├── types.ts        ← domain types (Room, Player, GameState, …)
│       ├── protocol.ts     ← client↔server message contracts
│       ├── game/           ← pure game logic (Phase 1)
│       └── index.ts
├── server/
│   └── src/
│       ├── index.ts        ← HTTP + WS bootstrap
│       ├── connection.ts   ← socket lifecycle, message routing (Phase 2)
│       ├── roomManager.ts  ← room registry (Phase 3)
│       ├── room.ts         ← per-room state machine (Phases 3–5)
│       └── persistence.ts  ← event log write/replay (Phase 6)
└── client/
    └── src/
        ├── App.tsx
        ├── ws/             ← WebSocket client wrapper (Phase 7)
        ├── state/          ← reducer + context (Phase 7)
        ├── pages/          ← Home, Room (Phases 8–9)
        └── components/     ← Seat, Dice, Koozie, Chat, … (Phases 8–10)
```

---

## Canonical Game Rules

**Moved to [docs/GAME_RULES.md](./docs/GAME_RULES.md)** — that file is now canonical
(straight payout, wilds, voluntary-stand rule, forfeits, 2–8 seats).

---

## WebSocket Protocol

**Moved to [docs/PROTOCOL.md](./docs/PROTOCOL.md)** — that file is now canonical (physics
throw handshake per ADR 004; there is no `turn:roll` and no server RNG).

---

## Development Phases

Conventions for all phases:

- TypeScript strict mode everywhere. No `any` unless unavoidable and commented.
- Pure game logic lives in `shared/src/game/` with unit tests (Vitest) colocated as `*.test.ts`.
- Run `npm run check` (typecheck all workspaces) and `npm test` before declaring a phase done.
- Keep commits small; one commit per task or small task group.

---

### Phase 0 — Project scaffolding ✅ (already complete)

- [x] npm workspaces monorepo with `shared/`, `server/`, `client/`
- [x] TypeScript configs, Vite + React client skeleton, express + ws server skeleton
- [x] Shared package with domain types (`types.ts`) and protocol contracts (`protocol.ts`)
- [x] Root scripts: `npm run dev` (server + client concurrently), `npm run check`, `npm test`, `npm run build`

---

### Phase 1 — Pure game logic (`shared/src/game/`) ✅

**Goal:** All dice math implemented and unit-tested. No server/client work in this phase.

- [x] **1.1 Dice rolling** — `dice.ts`: `rollDice(count: number, rng: () => number): Die[]` where `Die` is 1–6. RNG is injected for testability. Add `keepAndReroll(hand: Die[], keepIndices: number[], rng): Die[]`.
  - *Accept:* deterministic with a seeded rng stub; throws on invalid keep indices.
- [x] **1.2 Hand scoring** — `score.ts`: `scoreHand(dice: Die[], rollsUsed: number): HandScore` returning `{ count, face, rollsUsed, straight: 'none'|'little'|'big' }`.
  - *Accept:* unit tests for: five of a kind, tied group counts (higher face wins), both straights, no-pair hands.
- [x] **1.3 Hand comparison** — `compare.ts`: `compareHands(a: HandScore, b: HandScore): -1 | 0 | 1` implementing the canonical ordering (straights beat non-straights; big > little; then count → face → fewer rolls; 0 = tie).
  - *Accept:* exhaustive test table covering each tiebreak level and straight-vs-straight ties.
- [x] **1.4 Straight bonus calculator** — `bonus.ts`: `calcStraightBonus(config: StraightBonusConfig, kind: 'little'|'big', streakLength: number): number` applying base, multiplier, incremental streak, and `maxBonus` cap, in that order.
  - *Accept:* tests for each config flag combination, including cap clipping and `enabled: false` → 0.
- [x] **1.5 Round winner resolution** — `resolve.ts`: `resolveRound(hands: Map<PlayerId, HandScore>): { winners: PlayerId[] }` (length > 1 means tie → sub-round).
  - *Accept:* tests: clear winner, 2-way tie, 3-way tie, tie broken by rollsUsed.
- [x] **1.6 Export everything from `shared/src/index.ts`** and ensure `npm run check` passes.

**Verification:** ✅ `npm test --workspace=shared` green — 42 tests across 5 files; all workspaces typecheck.

---

### Phase 2 — Server foundation (`server/src/`) ✅

**Goal:** A WebSocket server that accepts connections, parses/validates protocol messages, and routes them — no game logic yet.

- [x] **2.1 Message parsing & validation** — `protocol.ts` (server-side): `parseClientMessage(raw: string): ClientMessage | { error }`. Validate `type` against the union and required payload fields (hand-rolled guards are fine; no need for zod unless preferred).
  - *Accept:* malformed JSON, unknown type, and missing fields all produce a structured error, never a throw.
- [x] **2.2 Connection wrapper** — `connection.ts`: class wrapping a `ws` socket with `send(msg: ServerMessage)`, ping/pong heartbeat (30s interval, terminate dead sockets), and a `playerId`/`roomId` binding once joined.
  - *Accept:* dead sockets are removed within 60s (test with a manually destroyed socket).
- [x] **2.3 Message router** — `router.ts`: dispatch table `Record<ClientMessage['type'], Handler>`. Unhandled errors inside handlers reply with `error { code: 'INTERNAL' }` and never crash the process.
  - *Accept:* a handler that throws results in an error message to that client only; server stays up.
- [x] **2.4 Bootstrap** — `index.ts`: express app + `ws` server on one HTTP server, port from `PORT` env (default 3001). `GET /health` returns `{ ok: true, rooms: n }`. In production (`NODE_ENV=production`) serve `client/dist` statically with an SPA fallback to `index.html`.
  - *Accept:* `npm run dev --workspace=server` starts; `curl localhost:3001/health` works; `wscat -c ws://localhost:3001` connects and an invalid message gets an `error` reply.

**Verification:** ✅ 20 unit tests (parsing, router error isolation, heartbeat sweep removal) + live smoke script `server/scripts/smoke-ws.mjs`: connect → malformed JSON / unknown type / missing fields / unwired type each got the right `error` reply.

---

### Phase 3 — Rooms, players, seats (`server/src/room.ts`, `roomManager.ts`) ✅

**Goal:** Full pre-game lifecycle: create, join via URL, seat requests, approval, kick, host transfer.

- [x] **3.1 RoomManager** — create/get/destroy rooms. Room IDs: 6-char unambiguous alphanumerics (no `0/O/1/l`). Empty-room reaper: destroy after 30 min with no connections (interval check is fine).
- [x] **3.2 `room:create`** — creates room with validated settings (clamp to allowed ranges from the settings table), creates host player, replies `room:created`, logs nothing yet (persistence is Phase 6).
- [x] **3.3 `room:join` / rejoin** — adds spectator, or reclaims identity when `rejoinToken` matches (restores seat/chips, marks connected). Reply `room:joined` with full snapshot; broadcast `room:state` to others. Unknown `roomId` → `error { code: 'ROOM_NOT_FOUND' }`.
- [x] **3.4 Seat requests** — `seat:request` (validate buy-in bounds, fixed eight-seat room not full, not banned) → notify host via `seat:requested`; `seat:approve` seats the player with their buy-in chips, including during play; `seat:deny` notifies the requester. Host's own seat request auto-approves.
- [x] **3.5 Kick & ban** — `player:kick` (host only, not self): seated → spectator, marked banned from seat requests. Mid-turn kick: treat their turn as an immediate stand (will matter in Phase 4; stub a hook for now).
- [x] **3.6 Host transfer & disconnect handling** — on host disconnect, promote the longest-seated connected player (else longest-connected spectator). On any disconnect, mark player disconnected; start the 2-minute seat-forfeit timer for seated players.
- [x] **3.7 Snapshot builder** — `buildSnapshot(room, forPlayerId)`: serializes the room per the protocol, stripping other players' tokens. Broadcast helper `broadcastState(room)` that sends each connection its own snapshot.

**Verification:** ✅ 22 unit tests (`room.test.ts`: seats, kick/ban, buy-in bounds, host transfer, forfeit timers, snapshot privacy, reaper) + `server/scripts/smoke-rooms.mjs` over real websockets: create → join ×2 → seat request → approve → NOT_HOST rejection → kick/ban → host disconnect → transfer; all 9 assertions green.

---

### Phase 4 — Core game engine (`server/src/engine.ts`) ✅

**Goal:** Playable rounds end-to-end (no ties, no bonuses yet — those are Phase 5).

- [x] **4.1 Game state machine** — room `phase: 'lobby' | 'playing' | 'roundEnd'`; game state: round number, turn order, current turn (playerId, dice, kept mask, rollsUsed, rollCap), pot, rollToBeat (best `HandScore` + holder). `game:start` (host, ≥2 seated) → antes collected, first round begins.
- [x] **4.2 `turn:roll`** — validate it's the sender's turn, rolls remain under the turn's cap, keepIndices only grow (can't un-keep). Roll via `shared` dice functions with `crypto`-seeded rng. Broadcast `turn:rolled` then `room:state`. Auto-stand when all 5 dice are kept or roll cap is reached.
- [x] **4.3 `turn:stand`** — score hand via `scoreHand`, update rollToBeat if better, set the round's roll cap from the first player's `rollsUsed`, advance to next seated player.
- [x] **4.4 Round resolution** — after the last turn, `resolveRound`; single winner → award pot, broadcast `round:ended`, enter `roundEnd` phase. After 5s (timer) auto-start next round: re-ante (skip/sit-out broke players), rotate starting player to winner's left. If <2 players can ante, return to `lobby`.
- [x] **4.5 Turn timers & disconnects** — 60s per-turn timer → auto-stand. Disconnected player's turn → immediate auto-stand. Kicked mid-turn → auto-stand (wire the Phase 3.5 hook).
- [x] **4.6 Engine unit tests** — extract the state machine into a testable class `GameEngine` (no sockets, emits events) and unit test: full 3-player round with scripted rng, roll-cap pressure, broke-player sit-out, auto-stand paths.

**Verification:** ✅ 13 engine unit tests with scripted rng (full round, rotation, roll-cap pressure, keep validation, sit-outs, auto-stand paths) — 55 server tests total. `server/scripts/smoke-game.mjs` plays a full round over real websockets: antes → rolls with kept dice preserved → roll-cap pressure → pot awarded → chips conserved → round 2 auto-start (14 assertions green). Note: tie handling temporarily awards the pot to the earliest finisher among tied players — replaced by sub-rounds in Phase 5.

---

### Phase 5 — Special rules: ties & straight bonuses ✅

**Goal:** Sub-rounds with doubled antes; full straight bonus system.

- [x] **5.1 Sub-round state** — extend game state with `subRound: { depth, participants, ... } | null`. On tie: broadcast `subround:started`, collect doubled antes (`chipsPerRound * 2^depth`, all-in if short), restrict turns to tied players, reset roll cap.
- [x] **5.2 Nested ties** — sub-round tie → deeper sub-round, ante doubles again. Guard: cap depth at 10 (then sudden-death single roll, higher `(count, face)` wins, repeat until broken) to avoid infinite loops.
- [x] **5.3 Straight detection & bonus award** — ~~pot/direct bonus with streaks (`calcStraightBonus`, `bonus:awarded`)~~ *(historical — replaced 2026-07 by the instant zero-sum straight payout: `applyStraightPayout`, `straight:paid`; see docs/GAME_RULES.md "Straights")*.
- [x] **5.4 Engine tests** — scripted-rng tests: 2-way tie → sub-round → winner takes enhanced pot; nested sub-round ante math; all-in short-stack tie; each bonus config combination affecting pot vs chips; incremental streak across players and its reset.

**Verification:** ✅ 11 new scripted-rng engine tests (`engine.phase5.test.ts`): 2-way tie → doubled-ante sub-round → enhanced pot; non-tied players excluded + roll cap reset; nested ante math (2x → 4x); all-in short stack winning the whole pot; depth-11 sudden death with chip conservation; pot vs direct bonuses; multiplier; incremental streak across players + reset; maxBonus cap; disabled config; tied straights each earning bonuses before the sub-round. 66 server tests + both live smoke scripts green. The Phase 4 tie caveat is resolved.

---

### Phase 6 — Persistence & crash recovery (`server/src/persistence.ts`) ✅

**Goal:** Server restart loses nothing important.

- [x] **6.1 Event log writer** — append-only JSON Lines per room at `server/logs/<roomId>.log` (dir auto-created, gitignored). Log every state-mutating event (joins, seats, settings, antes, rolls **with their dice values**, stands, round results, bonuses, chat, kicks). Synchronous-enough writes: `fs.appendFile` with an in-order queue per room.
- [x] **6.2 Replay on boot** — on server start, scan `server/logs/*.log`, rebuild each room by replaying events through the same reducers the live path uses (refactor mutations into `applyEvent(room, event)` so live and replay share code). Mark all players disconnected; rooms resume in `roundEnd`-equivalent pause until players rejoin via their `rejoinToken`s.
- [x] **6.3 Log hygiene** — destroy-room also deletes the log. Compact on round end: rewrite log as a single `snapshot` event + subsequent events (prevents unbounded growth).
- [x] **6.4 Recovery test** — integration test: play half a round, simulate restart (new RoomManager from logs), rejoin with tokens, assert chips/pot/seats/settings/streak survived and play can continue.

**Verification:** ✅ 4 recovery tests in `server/src/persistence.test.ts` (log replay, rejoin with tokens, chips/pot/seats/settings/streak survival) — 112 tests total across all workspaces. Notes: chat logging deferred to Phase 10 (the `chat` event type exists for replay but nothing emits it yet); manual smoke script `server/scripts/smoke-recovery.mjs` exists but isn't in `npm test`.

---

### Phase 7 — Client foundation (`client/src/ws/`, `client/src/state/`)

**Goal:** Typed WebSocket client, app state, and routing — no real UI yet.

- [ ] **7.1 WS client** — `ws/client.ts`: connect to `ws://<host>:3001` in dev (Vite proxy or env var `VITE_WS_URL`), same-origin in prod. Typed `send(msg: ClientMessage)`, message listener dispatching `ServerMessage`s, auto-reconnect with exponential backoff (1s → 30s), resends `room:join` with stored `rejoinToken` on reconnect.
- [ ] **7.2 App state** — `state/store.ts`: `useReducer` + context (no extra state lib). State: `connection`, `me { playerId, rejoinToken }`, latest `RoomSnapshot`, chat log (client-side ring buffer of 200), transient UI events (last roll for animation, errors/toasts). `rejoinToken` + `roomId` persisted to `localStorage` keyed by room.
- [ ] **7.3 Routing** — React Router: `/` (home: create or join) and `/room/:roomId` (joins on mount, prompting for a display name if none stored). Unknown room → error screen with link home.
- [ ] **7.4 Dev plumbing** — Vite dev proxy for `/health` and WS; confirm `npm run dev` at root runs server (3001) + client (5173) together with live reload.

**Verification:** with the dev stack up, two browser tabs can create/join a room and watch raw snapshots update (Room page **Room snapshot (debug)** `<pre>` block). **→ Step-by-step: [docs/browser-testing.md](./docs/browser-testing.md#phase-7--client-foundation-2-tabs)** (agents: also read [AGENTS.md](./AGENTS.md)).

---

### Phase 8 — Lobby & room management UI

**Goal:** Everything before the first dice roll, fully usable and presentable.

- [ ] **8.1 Home page** — create-room form (name + all settings from the table, with the documented defaults and inline help text) and join-room form (room code + name). Copyable invite URL (`/room/:roomId`) shown after creation.
- [ ] **8.2 Room lobby layout** — table view with 8 seat positions arranged around an oval table; seated players show name, chip count, connection dot, host badge. Spectator strip below. Responsive: stacks vertically under 640px.
- [ ] **8.3 Seat flow** — spectator: "Request seat" with buy-in input (bounds shown). Host: approval queue panel (approve/deny per request) and kick controls in a per-player menu. Pending/denied/banned states surfaced to the requester.
- [ ] **8.4 Host settings panel** — between rounds, host can edit settings (`settings:update`); read-only view of current settings for everyone else.
- [ ] **8.5 Start game** — host-only Start button, enabled at ≥2 seated; non-hosts see "waiting for host."
- [ ] **8.6 Errors & toasts** — `error` messages and transient events (kicked, denied, host transferred) render as toasts; being kicked also returns you to spectator view.

**Verification:** browser-test the full pre-game flow with 3 tabs (host + 2 players), including a kick and a host-disconnect transfer. No console errors. **→ Step-by-step: [docs/browser-testing.md](./docs/browser-testing.md#phase-8--lobby-ui-3-tabs)** (agents: also read [AGENTS.md](./AGENTS.md)).

---

### Phase 9 — Game table UI: dice, koozie, gameplay

**Goal:** The actual game, with the koozie roll animation.

- [ ] **9.1 Dice components** — `Die` (SVG pips, values 1–6, `kept` visual state) and `DiceRow` (click to toggle keep on your own turn; kept dice locked once a roll happens). Hidden/face-down state for opponents mid-roll if needed (server sends values; we still show them — dice are public).
- [ ] **9.2 Koozie animation** — `Koozie.tsx`: an animated cup that, on `turn:rolled`, shakes (CSS keyframes, ~900ms), slams down, lifts to reveal the dice with a slight stagger. Pure CSS/`framer-motion`-free (keep deps light). Skipped (instant reveal) for `prefers-reduced-motion`.
- [ ] **9.3 Turn controls** — for the active player: Roll button (shows rolls used / cap), Stand button, keep-toggling enabled between rolls. 60s turn timer ring. For others: whose turn it is, live roll results via `turn:rolled`.
- [ ] **9.4 Game HUD** — pot size (chip stack visual), roll-to-beat (dice + holder name), round number, sub-round banner with depth & doubled ante when active, per-seat chip counts updating live.
- [ ] **9.5 Round & straight moments** — `round:ended`: winner highlight + pot-slide animation + scores recap modal (dismissal immediately starts the next round; 8s server fallback only); null winner renders the pot-carryover state. `straight:paid`: celebration moment showing kind (little/big), total collected, and per-player payments (currently a toast + chat line; a richer banner is open work).
- [ ] **9.6 Spectator view** — spectators see everything read-only; seat-request remains available between rounds.
- [x] **9.7 Central after-roll delay** — host-configurable quiet window after every normal/bonus
  roll (default 2000ms) before payouts, celebrations, bonus offers/results, automatic stands,
  turn/sub-round transitions, pot awards, or winner recap; replaces the client-only recap timer.
  Ordinary rolls return the koozie immediately for rapid same-player rerolls; capped/special
  rolls lock it without a transient dock flash.

**Verification:** play 3 full rounds with 3 tabs including a tie and a straight (dice are client-reported — ADR 004 — so a tie/straight can be forced from the browser console by sending scripted `turn:throwResult` faces); record that animations fire and state never desyncs from a hard-refresh rejoin.

---

### Phase 10 — Chat

**Goal:** Lightweight room chat.

- [ ] **10.1 Server** — `chat:send`: validate ≤500 chars, non-empty, rate-limit 5 msgs / 5s per player; broadcast `chat:message`; include in persistence log (Phase 6 writer).
- [ ] **10.2 Client** — collapsible chat panel (right side desktop, bottom sheet mobile): message list with name + timestamp, autoscroll (pinned to bottom unless user scrolled up), unread badge when collapsed. System lines (joins, kicks, round winners) rendered inline in a muted style.

**Verification:** chat works across 3 tabs; rate limit returns an `error` toast; messages survive a server restart (replayed from log).

---

### Phase 11 — Hardening & polish

**Goal:** Production-ready behavior.

- [x] **11.1 Reconnect UX** — connection-lost banner with auto-retry status; full state recovery on reconnect (token rejoin); queued-action prevention while disconnected (controls disabled).
- [x] **11.2 Input validation sweep** — server: clamp/validate every payload field (names ≤24 chars stripped of control chars, settings ranges, buy-ins, indices). Add tests for each rejection path.
- [x] **11.3 Visual polish** — consistent design tokens (CSS variables: felt-green table, warm chip colors, readable dark UI), favicon, page titles (`Room ABC123 — Dice`), empty states, loading states.
- [x] **11.4 Mobile pass** — playable on a 390px viewport: seat layout, controls, chat sheet, koozie scale.
- [x] **11.5 Production build & run** — `npm run build` builds shared → server → client; `npm start` serves everything from the server on one port. Document in README. ~~Add a `Dockerfile` (node:22-slim, multi-stage)~~ — skipped per request (no Docker for now).

**Verification:** `npm run build && npm start`, play a full game on `localhost:3001` (single port), including on a phone-sized viewport.

---

### Phase 12 — End-to-end test suite

**Goal:** Confidence for future changes.

- [x] **12.1 WS integration harness** — `server/test/harness.ts`: spin up the server on an ephemeral port, helper `FakeClient` (connect, send, await message of type X with timeout).
- [x] **12.2 Full-game E2E** — scripted throw handshake over real websockets (`server/test/game-flow.test.ts`); smoke scripts remain for richer multi-round manual checks.
- [x] **12.3 CI** — GitHub Actions workflow: install, `npm run verify`, `npm run build` on push/PR.

**Verification:** CI green on a fresh clone.

---

## Worker Agent Operating Notes

- **One phase at a time.** Read the phase's goal, [docs/GAME_RULES.md](./docs/GAME_RULES.md), and [docs/PROTOCOL.md](./docs/PROTOCOL.md) before writing code.
- **Check off tasks in this file** (`[ ]` → `[x]`) in the same change that completes them.
- **Never let client and server disagree:** protocol changes follow the ripple checklist in [docs/CODING_GUIDELINES.md](./docs/CODING_GUIDELINES.md) §1 — `shared/src/protocol.ts` first, then let the typecheck errors walk you through both sides in the same change.
- **Determinism:** dice come from the roller's client (ADR 004) — tests script explicit faces through `server/src/engine.testkit.ts`; there is no server rng.
- **If a rule seems ambiguous or contradictory**, implement the most literal reading of docs/GAME_RULES.md and note the ambiguity in your summary rather than redesigning.
