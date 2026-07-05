# Architecture

Orientation for working in this codebase. Rules → [GAME_RULES.md](./GAME_RULES.md), wire
contract → [PROTOCOL.md](./PROTOCOL.md), conventions → [CODING_GUIDELINES.md](./CODING_GUIDELINES.md),
decisions → [decisions/](./decisions/).

## Workspaces

npm workspaces: `shared` (types + protocol + pure game logic), `server` (express + ws,
authoritative state), `client` (React 19 + Vite + react-three-fiber/rapier 3D table).

`@dice/shared` is consumed as **raw TypeScript source** — its package `exports` point at
`src/index.ts`; nothing is prebuilt. The client resolves it through Vite; the server uses
tsx in dev and bundles it via the esbuild alias in `server/package.json` at build time.
Consequence: a change in `shared/` immediately affects both sides — typecheck both
(`npm run check`) after touching it.

Dev: `npm run dev` → server :3001, client :5173 (Vite proxies `/ws` + `/health`).
Prod: `npm run build && npm start` → one server on :3001 serving the built client.

## The roll data flow (the spine of the app)

Physics-authoritative rolls (ADR 004): the roller's client simulates the dice and reports
the result; the server orchestrates, validates, persists, and fans out.

```
pointer release on the koozie
  → client/src/table3d/dice/DicePhysics.tsx   (rapier cup/dice state machine)
  → client/src/game/useTableRoll.ts           (binds physics callbacks to the socket)
  → ws  turn:throwStart { keepIndices }
  → server: router.ts → handlers.ts → engine.beginThrow   (locks keeps, arms 15s timeout)
  → broadcast turn:throwStarted; roller streams dice:frames (relayed to spectators,
    consumed by useRemoteRoll.ts → RemoteDiceView — never touches the reducer)
  → sim settles → ws turn:throwResult { dice }
  → engine.commitThrow    (integrity: 5 dice ∈ [1,6], kept positions unchanged)
  → engine.settleRoll     (single entry point shared with log replay)
      → emit 'rolled' → persisted + broadcast turn:rolled
      → applyStraightPayout (instant zero-sum side payment)
      → auto-stand at rollCap
  → room.onEngineEvent    (EngineEvent → RoomEvent log entry + ServerMessage broadcast)
  → room.broadcastState   (authoritative RoomSnapshot → every client)
  → client/src/state/store.ts reducer folds room:state / turn:rolled into AppState
  → pages/Room.tsx → Table → TableCanvas → 3D scene re-renders
```

Timeout ladder: 60s turn (`TURN_TIMEOUT_MS`) → forced stand on settled dice, or **forfeit**
if the turn has no dice (there is no server roll to fall back on); 15s throw
(`THROW_TIMEOUT_MS`) → same force-resolution; 5s round-end delay → next round.

## Seat/view transform

The 3D scene always renders in the local player's view space (viewer at the bottom; the
scene never rotates). Seat identity is applied to pose data **at the wire boundary**:
`client/src/table3d/seatTransform.ts` rotates outgoing frames to canonical space and
incoming frames into the local view. If dice appear in the wrong place for one seat only,
look there.

## Persistence

`server/src/persistence.ts`: append-only JSON-Lines `RoomEvent` log per room, compacted to
a single snapshot at every round end. Boot recovery replays the log through the same
reducers the live path uses (`applyReplayEvent` → engine `replayRolled`/`stand`/
`forceStand`, everything else → `room.applyEvent`). Replay re-applies straight payouts —
chip movements are reproduced, not stored.

## Big files — extract, don't grow

| File | Lines | Role |
|---|---|---|
| `client/src/table3d/dice/DicePhysics.tsx` | ~1200 | Imperative rapier cup/dice state machine (`CupPhase`) |
| `server/src/room.ts` | ~680 | Membership + engine fan-out + persistence wiring |
| `server/src/engine.ts` | ~640 | Round/turn state machine (socket-free) |
| `client/src/dev/Playground.tsx` | ~590 | Dev-only scene sandbox (`/dev/play`) |

These four are at their complexity budget. New behavior near them goes in a new module they
call, not in more lines inside them (CODING_GUIDELINES §3).

## Test layout

Vitest, colocated `*.test.ts`, one root `npm test` discovers all workspaces. Engine tests
script dice through `server/src/engine.testkit.ts` (`roll()` = beginThrow + commitThrow with
explicit faces). WebSocket/multi-tab behavior is not unit-tested — use the smoke scripts
(`server/scripts/smoke-*.mjs`) and the browser flows in
[browser-testing.md](./browser-testing.md); the `verify-game-flow` skill wraps both.
