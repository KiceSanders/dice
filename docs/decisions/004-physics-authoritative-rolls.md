# 004. Physics-authoritative rolls with live pose streaming

**Status:** accepted  
**Date:** 2026-07-03

## Context

The 3D koozie/dice physics (ADR [002](./002-rapier-physics-stack.md)/[003](./003-3d-round-play-visual-flow.md)) lives only in the dev Playground, where the settled simulation decides die values (`readTopFace`). The production game is fully server-authoritative: `GameEngine.roll()` draws crypto-RNG dice and broadcasts `turn:rolled`. Making physics the real way to roll means reconciling the two — and other players should watch the throw live, not just receive final values.

## Decision

**The roller's physics simulation decides the dice.** New protocol messages ([`protocol.ts`](../../shared/src/protocol.ts)):

- `turn:throwStart { keepIndices }` — sent on koozie release. The engine (`beginThrow`) locks **this throw's** keep set (it may shrink relative to prior `keptIndices` — players can release earlier keeps), flags the turn `throwing` (new `TurnState` field), and broadcasts `turn:throwStarted`.
- `turn:throwResult { dice }` — sent when the sim settles. The engine (`commitThrow`) validates turn owner, throw in flight, 5 dice in [1, 6], and **positions in this throw's keep set unchanged**, then applies the values exactly like an RNG roll — same `rolled` event, same `turn:rolled` broadcast, same event-log entry.
- `dice:frames { frames }` — ~20 Hz koozie+dice poses, relayed verbatim to everyone else (`Room.broadcastExcept`), rate-limited per connection, silently dropped when invalid, never persisted. Spectators animate plain meshes from these; they run no physics.

**Pending throws:** if a throw is in flight and the roller disconnects or is kicked,
`forceStand` abandons it. Host controls for stalled games are planned separately.

**Trust model:** dice values are client-reported, so a tampered client could lie — accepted for friends-scale play. The kept-positions + range checks are the enforced invariants; the server stays authoritative over everything downstream (scoring, pot, turn order).

**Replay is untouched:** the log stores final `rolled` values; `ReplayRng` feeds them back through `roll()`/`keepAndReroll`, which reproduces physics-sourced dice exactly *because* positions in each throw's keep set cannot change face mid-throw.

## Rejected alternatives

| Alternative | Why not |
|---|---|
| Server RNG + steered/relabeled dice | Cheat-proof, but the throw becomes theater; contradicts "your roll is what lands." |
| Deterministic replay on every client | Needs seeded randomness, fixed-tick kinematic cup motion, and Rapier's `enhanced-determinism` build; any divergence shows spectators wrong faces. |
| Spectator re-sim + snap to result | Low bandwidth, but spectators watch a different tumble and see a correction pop at settle. |

## Consequences

- The `protocol.ts` header rule "the client never computes game outcomes" is narrowed to non-dice outcomes.
- `turn:roll` (server RNG) remains as the 2D-fallback and internal fallback path.
- `TurnState.throwing` lets a reconnecting client render "rolling…" mid-throw.
- **Follow-ups:** Room wiring for the roller (send throwStart/throwResult from the 3D table), spectator pose playback from `dice:frames`, then the full ADR 003 UX in production `Room.tsx`.

## Verification

- `npm test` — [`engine.throw.test.ts`](../../server/src/engine.throw.test.ts) (begin/commit validation, cap auto-stand), `protocol.test.ts` (message validation).
- Two browsers in one room once client wiring lands: roller throws; spectator receives `turn:throwStarted` + `dice:frames` + `turn:rolled`.

## See also

- [002 — Rapier physics stack](./002-rapier-physics-stack.md)
- [003 — 3D round-play visual flow](./003-3d-round-play-visual-flow.md)
