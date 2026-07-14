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
| `settings:update` | `{ settings }` | Host only (anytime; chip amounts apply at next ante / payout) |
| `game:start` | `{}` | Host only, ≥2 seated |
| `turn:throwStart` | `{ keepIndices }` | Physics roll phase 1: koozie released, locks this throw's keep set (may shrink vs prior `keptIndices`) |
| `turn:throwResult` | `{ dice, restPose? }` | Phase 2: settled faces (kept positions unchanged) + where they rest (canonical space, 5 dice, ADR 005). An invalid `restPose` is dropped server-side; the throw itself never fails on it |
| `turn:bonusThrowStart` | `{}` | Yahtzee bonus phase 1: koozie released with a temporary sixth die; all 5 hand dice stay railed |
| `turn:bonusThrowResult` | `{ die }` | Phase 2: the settled bonus face, integer in [1, 6]. The temporary die is removed and the roller auto-stands. Carries no `restPose` — the quint's pose stays the between-turns layout |
| `dice:frames` | `{ frames: PoseFrame[] }` | ~20 Hz throw poses; relayed, never persisted |
| `turn:stand` | `{ restPose? }` | Voluntary stand (gated by `canStandVoluntarily`); optional final selecting layout (canonical space, 5 dice, ADR 005) so dice stay exactly where they were when Stand was clicked. Invalid `restPose` is dropped server-side; the stand itself never fails on it |
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
| `classic:donated` | `{ playerId, amount, classicPot }` | First-roll four-of-a-kind → Classic Pot |
| `classic:won` | `{ playerId, amount }` | First-roll three 6s while roll-to-beat unset takes Classic Pot |
| `turn:bonusOffered` | `{ playerId, face }` | A Yahtzee settled: the roller owes a temporary sixth-die throw before auto-standing |
| `turn:bonusThrowStarted` | `{ playerId }` | A bonus throw is in flight |
| `turn:bonusRolled` | `{ playerId, die, face, matched }` | The bonus die settled; `matched = die === face` (a rolled 1 is NOT wild here) |
| `yahtzee:paid` | `{ playerId, amountPerPlayer, total, payments }` | Yahtzee bonus hit: every other seated player paid the roller |
| `round:started` | `{ roundNumber, antes: { playerId, amount }[] }` | Exact per-player contributions for table chip animation |
| `round:ended` | `{ winnerId: PlayerId \| null, potWon, scores }` | `winnerId: null` = all forfeited, pot carries over |
| `subround:started` | `{ tiedPlayerIds, anteAmount, depth, antes: { playerId, amount }[] }` | `antes` contains actual equal-floor payments (may be below `anteAmount`) |
| `chat:message` | `{ playerId, playerName, text, ts }` | |
| `error` | `{ code, message }` | `ErrorCode` union in protocol.ts |

Egress is lightly validated by the client in `client/src/ws/protocol.ts`
(`parseServerMessage`) before it reaches app state. Its validator table is
`Record<ServerMessage['type'], Validator>`, so adding a wire message without a parser case
fails `npm run check:client`. Unknown runtime messages are dropped before the reducer; known
messages still rely on the reducer's `assertUnreachable` default in
`client/src/state/store.ts` for exhaustive state handling.

## The three event vocabularies

One game event crosses three deliberately distinct unions. The mapping is hand-written in
`handleEngineEvent` (`server/src/roomGameBridge.ts`) and guarded by an `assertNever`
default — a new `EngineEvent` that is not mapped fails the typecheck. **When you add a row
to any column, update this table.**

| `EngineEvent` (engine.ts) | `RoomEvent` (events.ts, persisted log) | `ServerMessage` (wire) | Client handling (store.ts) |
|---|---|---|---|
| `roundStarted` | `roundStarted` ✓ | `round:started` | `lastAnte` (table chip animation) |
| `throwStarted` | — (not recorded) | `turn:throwStarted` | ignored by reducer; 3D table consumes off the socket |
| `rolled` | `rolled` ✓ (`restPose?` optional so old logs parse) | `turn:rolled` | `lastRoll` (animation + settled layout) |
| `stood` | `stood` ✓ (`restPose?` optional so old logs parse) | — (snapshot only) | via `room:state` |
| `forfeited` | `forfeited` ✓ | `turn:forfeited` | system chat line |
| `roundEnded` | `roundEnded` ✓ (then log compaction) | `round:ended` | `roundEnd` (recap modal) + chat line |
| `subRoundStarted` | `subRoundStarted` ✓ | `subround:started` | `lastAnte` (table chip animation) + toast |
| `straightPaid` | `straightPaid` ✓ | `straight:paid` | `lastTransfer` (seat-to-seat chip animation) + toast + chat line |
| `classicDonated` | `classicDonated` ✓ | `classic:donated` | `lastClassicDonate` (seat → classic pot chip animation) + toast + chat line |
| `classicWon` | `classicWon` ✓ | `classic:won` | `lastClassicWin` (classic pot → seat chip animation) + toast + chat line |
| `bonusOffered` | — (replaying the quint `rolled` re-offers) | `turn:bonusOffered` | toast + chat line |
| `bonusThrowStarted` | — (not recorded) | `turn:bonusThrowStarted` | ignored by reducer; 3D table consumes off the socket |
| `bonusRolled` | `bonusRolled` ✓ (die only; replayed via `replayBonusRolled`) | `turn:bonusRolled` | chat line on a miss; never touches `lastRoll` |
| `yahtzeeBonusPaid` | `yahtzeeBonusPaid` ✓ (audit-only, recomputed on replay) | `yahtzee:paid` | `lastTransfer` (seat-to-seat chip animation) + toast + chat line |
| `stateChanged` | — | — (triggers `room:state` broadcast) | snapshot merge |
| `gameEnded` | `gameEnded` ✓ | — (snapshot only) | via `room:state` |

Membership events (`playerJoined`, `seated`, `kicked`, `settingsUpdated`, `hostChanged`,
`chat`, …) exist only as `RoomEvent`s for the persistence log; clients learn about them
through `room:state` snapshots (plus `chat:message` for chat). Replay path:
`server/src/persistence.ts` `applyReplayEvent` re-drives game events through the engine
(`replayRolled` re-applies straight payouts and Classic Pot transfers) and everything else through `room.applyEvent`.

## Ephemeral vs persisted

`dice:frames`, `turn:throwStarted`, and `turn:bonusThrowStarted` are streaming/transient —
never persisted, never in the reducer's state. Bonus frames temporarily carry the cup plus
six dice; the bonus die result carries no rest pose and the sixth die is discarded, so the
quint's settled five-die pose remains the between-turns layout. Everything a recovered room needs lives in the `RoomEvent` log
(`server/logs/<roomId>.log`, JSON Lines, compacted to a snapshot at each round end).

The settled **rest pose** is the exception that proves the rule (ADR 005): unlike the
frame stream, the final layout IS state. It rides `turn:rolled`, can be refined by
`turn:stand` after the roller has moved newly kept dice to the rail, lives in the snapshot
(`currentTurn.restPose`, `rollToBeat.restPose` — canonical table space), and survives
crash recovery via the persisted `rolled` / `stood` events, so every viewer — including
rejoiners — renders the dice where they physically landed and where the hand was stood.

`GameStatePublic.rollToBeat` carries `playerIds: PlayerId[]` (first stander first; later
tiers who fully tie append). A strict beat replaces the list with the new leader alone.
