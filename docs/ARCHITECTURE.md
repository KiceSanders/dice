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
Prod: `npm run build && npm start` → one server on :3001 serving the built client and the
same-origin `/ws` endpoint. The public socket accepts only `/ws`, caps incoming frames at
64 KiB, and rejects cross-site browser origins (extra trusted origins can be listed in
`ALLOWED_ORIGINS`).

## The roll data flow (the spine of the app)

Physics-authoritative rolls (ADR 004): the roller's client simulates the dice and reports
the result; the server orchestrates, validates, persists, and fans out.

```
pointer release on the koozie
  → client/src/table3d/dice/DicePhysics.tsx   (rapier cup/dice state machine)
  → client/src/game/useTableRoll.ts           (binds physics callbacks to the socket)
  → ws  turn:throwStart { keepIndices }
  → server: router.ts → handlers.ts → engine.beginThrow   (locks keeps, marks turn throwing)
  → broadcast turn:throwStarted; roller streams dice:frames (relayed to spectators,
    consumed by useRemoteRoll.ts → RemoteDiceView — never touches the reducer)
  → sim settles → ws turn:throwResult { dice, restPose }
  → engine.commitThrow    (integrity: 5 dice ∈ [1,6], kept positions unchanged;
                           restPose soft-gated by shared validateRestPose — bounds +
                           faces must match the dice, else dropped to null, never the throw)
  → engine.settleRoll     (sets turn.restPose and arms the after-roll gate before publish)
      → emit 'rolled' → persisted + broadcast turn:rolled { …, restPose }
      → wait the captured settings.afterRollDelayMs
        (turn.resolving blocks Stand/outcome transitions; turn.koozieLocked blocks cup reuse
         only for capped, Yahtzee-transition, and bonus-die results; ordinary rerolls may overlap)
      → emit 'rollResolved' → broadcast turn:rollResolved
      → apply straight / first-roll Yahtzee payouts and Classic Pot transfers
      → offer the Yahtzee bonus or auto-stand at rollCap / last-player beat
  → roomGameBridge.handleEngineEvent
                         (EngineEvent → RoomEvent log entry + ServerMessage broadcast)
  → room.broadcastState   (authoritative RoomSnapshot → every client; snapshot carries
                           currentTurn.restPose / rollToBeat.restPose for rejoiners)
  → client/src/state/store.ts reducer folds room:state / turn:rolled into AppState
  → pages/Room.tsx → resolveTableRestPose (single settled-layout resolver, ADR 005)
  → Table → TableCanvas → 3D scene re-renders
```

When the roller clicks **Stand**, the client sends `turn:stand { restPose? }` with the
current selecting layout (including dice newly moved to the rail after the last settle).
The server soft-gates it with the same rest-pose validator and, if valid, replaces
`currentTurn.restPose` before copying it into `rollToBeat.restPose`.

Yahtzee bonus throws temporarily extend only the live physics/pose stream to six dice:
the five authoritative hand dice stay railed, a sixth die is created in the cup, and only
its face is sent in `turn:bonusThrowResult`. The sixth die is then removed, the original
five-die rest pose remains authoritative, and the engine stands the roller automatically.

After-roll delay: configurable per room (default 2s) and captured at normal/bonus settlement;
live outcomes wait, while crash replay resolves recorded rolls synchronously. When the final
delayed result emits `round:ended`, clients show the recap; its manual/automatic dismissal sends
`round:continue`, and the first seated request immediately starts the next round. The after-roll
delay is never applied again between recap dismissal and the next koozie owner. The engine's 8s
round-end timer is failure fallback only. Disconnect/kick during the quiet window queues the
forced stand until the roll resolves; otherwise `forceStand` stands on settled dice or forfeits
if none.

## Seat/view transform

The 3D scene always renders in the local player's view space (viewer at the bottom; the
scene never rotates). Seat identity is applied to pose data **at the wire/display
boundaries**: `client/src/table3d/seatTransform.ts` rotates outgoing frames onto the fixed
canonical ring, then rotates incoming canonical frames to the originating player's shared
occupied-card placement for that viewer. If dice appear in the wrong place for one seat
only, look there.

Two angle systems remain deliberately separate. The eight logical seats form a uniform
full-circle `seatRingAngle` used only for canonical live/rest poses and the local physics
dock. `seatDisplayPlacements` is the single presentation source: the lobby shows all eight,
while play and round-end show occupied seats reflowed across the lower 2→10 o'clock arc.
Seat cards and the spectator koozie use its angle directly; streamed and static canonical
poses use `poseFrameForSeatDisplay` to rotate the complete player-authored frame to it.
Presentation angles are never streamed or persisted.

## Audio

`client/src/table3d/audio/` — one Web Audio graph (`audioEngine.ts`, the only impure
module) behind a single subscriber (`TableAudio`, mounted once in `Room.tsx`). Impact cues
travel a dedicated non-replaying `audioBus`; game-moment one-shots ride the existing
`tableEvents`. The roller derives impacts from rapier `onContactForce` on die colliders
(`rollerImpacts.ts` + pure `impactRules.ts` gate); spectators derive them from the
streamed pose frames (`useRemoteRoll` → `remotePoseAudio.ts` → pure `poseImpacts.ts`) —
no protocol involvement. Constants in `audioTuning.ts`, samples + processing pipeline
documented in `client/public/audio/CREDITS.md`. Full rules and the add-a-sound recipe:
[TABLE_UI.md § Audio](./TABLE_UI.md#audio--impacts-rattle-and-adding-a-sound).

## Persistence

`server/src/persistence.ts`: append-only JSON-Lines `RoomEvent` log per room, compacted to
a single snapshot at every round end. Boot recovery replays the log through the same
reducers the live path uses (`applyReplayEvent` → engine `replayRolled`/`stand`/
`forceStand`, everything else → `room.applyEvent`). Replay re-applies straight payouts and
Classic Pot donations/wins — chip movements are reproduced, not stored.

Chat history is the persisted exception to live-only client presentation: each accepted chat
event stores the sender's name and chip stack at send time, and rejoin history broadcasts that
snapshot with the text. The client reducer keeps player conversation in `chat` and derives
game/membership announcements into a separate 200-entry `activityLog`, rendered above room
settings with progressive disclosure.

Production is deliberately **single-instance**: rooms, connections, timers, and live pose
relay state are in memory. `LOG_DIR` must be on a persistent volume (the container default
is `/data`) so a restart can recover room logs. Do not add replicas or zero-downtime overlap
without first moving coordination and persistence to shared infrastructure; two instances
would route players in the same room to different authoritative engines.

## Active room directory

The home page polls over the existing WebSocket every five seconds: `room:list` →
`RoomManager.listActiveRooms()` → `rooms:list`. A directory entry exposes only its room code,
phase, current round number, and connected player names. Rooms with no live connections are
omitted immediately; their normal 30-minute recovery/rejoin grace period and eventual log
deletion remain unchanged. The client stores only the latest directory snapshot in
`AppState.activeRooms`; clicking an entry persists the entered display name and follows the
existing `/room/:roomId` join flow.

## Big files — extract, don't grow

| File | Lines | Role |
|---|---|---|
| `client/src/table3d/dice/DicePhysics.tsx` | ~1100 | Imperative rapier cup/dice state machine (`CupPhase`) |
| `server/src/room.ts` | ~590 | Membership + persistence wiring (engine fan-out → `roomGameBridge`) |
| `server/src/engine.ts` | ~630 | Round/turn state machine (socket-free; throw validation → `throwLifecycle`) |
| `client/src/dev/Playground.tsx` | ~590 | Dev-only scene sandbox (`/dev/play`) |

These four are at their complexity budget. New behavior near them goes in a new module they
call, not in more lines inside them (CODING_GUIDELINES §3). Related extractions:
`cupPhaseMachine`, `dicePointer`, `diceSettleHandoff`, `usePendingKeep`, `throwProtocol`,
`useTableScene`, `roomGameBridge`, `throwLifecycle`, `delayedAction`, `rollSideEffects`.
Cross-cutting table geometry constants
and builders are re-exported from `client/src/table3d/geometry.ts`.

## Test layout

Vitest, colocated `*.test.ts` plus server integration specs in `server/test/`; one root
`npm test` discovers all workspaces. Engine tests script dice through
`server/src/engine.testkit.ts` (`roll()` = beginThrow + commitThrow with explicit faces).
Browser multi-tab behavior is not unit-tested — use the smoke scripts
(`server/scripts/smoke-*.mjs`) and the browser flows in [browser-testing.md](./browser-testing.md);
the `verify-game-flow` skill wraps both.
