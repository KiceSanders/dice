# WebSocket Protocol

The wire contract is `shared/src/protocol.ts` — this file explains it and MUST be updated in
the same commit as any protocol change (see docs/CODING_GUIDELINES.md §1, or run the
`protocol-change` skill). All messages are JSON `{ "type": string, ...payload }`. The server
is authoritative over state; dice values come exclusively from the roller's physics sim
(ADR 004) — there is no server-side roll.

## Client → Server (`ClientMessage`)

| Type | Payload | Notes |
|---|---|---|
| `room:create` | `{ playerName, settings }` | Replies `room:created` |
| `room:join` | `{ roomId, playerName, rejoinToken? }` | Join as spectator; token reclaims identity |
| `seat:request` | `{ buyIn }` | Spectator asks for a seat |
| `seat:approve` / `seat:deny` | `{ playerId }` | Host only |
| `player:kick` | `{ playerId }` | Host only |
| `settings:update` | `{ settings }` | Host only, between rounds |
| `game:start` | `{}` | Host only, ≥2 seated |
| `turn:throwStart` | `{ keepIndices }` | Physics roll phase 1: koozie released, keeps locked |
| `turn:throwResult` | `{ dice, restPose? }` | Phase 2: settled faces (kept positions unchanged) + where they rest (canonical space, 5 dice, ADR 005). An invalid `restPose` is dropped server-side; the throw itself never fails on it |
| `dice:frames` | `{ frames: PoseFrame[] }` | ~20 Hz throw poses; relayed, never persisted |
| `turn:stand` | `{}` | Voluntary stand (gated by `canStandVoluntarily`) |
| `chat:send` | `{ text }` | ≤500 chars, rate-limited |

Ingress is structurally validated in `server/src/protocol.ts` (`parseClientMessage`). The
validator table is `Record<ClientMessage['type'], Validator>` — adding a message type
without a validator (or a handler in `server/src/handlers.ts`) fails `npm run check:server`.

## Server → Client (`ServerMessage`)

| Type | Payload | Notes |
|---|---|---|
| `room:created` | `{ roomId, playerId, rejoinToken }` | |
| `room:joined` | `{ playerId, rejoinToken, snapshot }` | Full snapshot on join/rejoin |
| `room:state` | `{ snapshot }` | Authoritative snapshot after every state change |
| `seat:requested` | `{ playerId, playerName, buyIn }` | To the host |
| `seat:denied` | `{}` | To the requester |
| `turn:throwStarted` | `{ playerId, kept, rollNumber }` | A throw is in flight |
| `dice:frames` | `{ playerId, frames }` | Relay of the roller's poses |
| `turn:rolled` | `{ playerId, dice, rollNumber, kept, restPose }` | The settled roll; `restPose` is the server-validated rest layout (`BodyPose[] \| null`, ADR 005) every viewer renders between turns |
| `turn:forfeited` | `{ playerId }` | Turn ended with no completed roll |
| `straight:paid` | `{ playerId, kind, amountPerPlayer, total, payments }` | Instant side payment |
| `round:ended` | `{ winnerId: PlayerId \| null, potWon, scores }` | `winnerId: null` = all forfeited, pot carries over |
| `subround:started` | `{ tiedPlayerIds, anteAmount, depth }` | |
| `chat:message` | `{ playerId, playerName, text, ts }` | |
| `error` | `{ code, message }` | `ErrorCode` union in protocol.ts |

Egress is **not** validated by the client — `client/src/ws/client.ts` casts
`JSON.parse(...) as ServerMessage`. Safety relies on the reducer's exhaustiveness guard
(`assertUnreachable` default in `client/src/state/store.ts`), which ignores unknown message
types at runtime instead of crashing.

## The three event vocabularies

One game event crosses three deliberately distinct unions. The mapping is hand-written in
`Room.onEngineEvent` (`server/src/room.ts`) and guarded by an `assertNever` default — a new
`EngineEvent` that is not mapped fails the typecheck. **When you add a row to any column,
update this table.**

| `EngineEvent` (engine.ts) | `RoomEvent` (events.ts, persisted log) | `ServerMessage` (wire) | Client handling (store.ts) |
|---|---|---|---|
| `roundStarted` | `roundStarted` ✓ | — (snapshot only) | via `room:state` |
| `throwStarted` | — (not recorded) | `turn:throwStarted` | ignored by reducer; 3D table consumes off the socket |
| `rolled` | `rolled` ✓ (`restPose?` optional so old logs parse) | `turn:rolled` | `lastRoll` (animation + settled layout) |
| `stood` | `stood` ✓ | — (snapshot only) | via `room:state` |
| `forfeited` | `forfeited` ✓ | `turn:forfeited` | system chat line |
| `roundEnded` | `roundEnded` ✓ (then log compaction) | `round:ended` | `roundEnd` (recap modal) + chat line |
| `subRoundStarted` | `subRoundStarted` ✓ | `subround:started` | toast |
| `straightPaid` | `straightPaid` ✓ | `straight:paid` | toast + chat line |
| `stateChanged` | — | — (triggers `room:state` broadcast) | snapshot merge |
| `gameEnded` | `gameEnded` ✓ | — (snapshot only) | via `room:state` |

Membership events (`playerJoined`, `seated`, `kicked`, `settingsUpdated`, `hostChanged`,
`chat`, …) exist only as `RoomEvent`s for the persistence log; clients learn about them
through `room:state` snapshots (plus `chat:message` for chat). Replay path:
`server/src/persistence.ts` `applyReplayEvent` re-drives game events through the engine
(`replayRolled` re-applies straight payouts) and everything else through `room.applyEvent`.

## Ephemeral vs persisted

`dice:frames` and `turn:throwStarted` are streaming/transient — never persisted, never in
the reducer's state. Everything a recovered room needs lives in the `RoomEvent` log
(`server/logs/<roomId>.log`, JSON Lines, compacted to a snapshot at each round end).

The settled **rest pose** is the exception that proves the rule (ADR 005): unlike the
frame stream, the final layout IS state. It rides `turn:rolled`, lives in the snapshot
(`currentTurn.restPose`, `rollToBeat.restPose` — canonical table space), and survives
crash recovery via the persisted `rolled` event, so every viewer — including rejoiners —
renders the dice where they physically landed.

`GameStatePublic.rollToBeat` carries `playerIds: PlayerId[]` (first stander first; later
tiers who fully tie append). A strict beat replaces the list with the new leader alone.
