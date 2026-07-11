# 005. Authoritative dice rest pose

**Status:** accepted  
**Date:** 2026-07-09

## Context

Under ADR [004](./004-physics-authoritative-rolls.md), the settled dice **positions** were
never state: they existed only in the ephemeral `dice:frames` stream, and each client
opportunistically captured "the last frame it happened to see" (the roller from its own
sim, spectators from the stream at `turn:rolled`). Whenever a capture was missing or
mismatched — dropped final frames under the relay's rate limit, a face misread on a
slightly tilted settled die, a roll-number race, any rejoin/refresh — the viewer fell back
to a values-only slot layout: **dice in a line across the center of the table**. With N
fragile per-client capture paths, every physics or turn-flow change risked regressing one
of them, and did, repeatedly.

## Decision

**The settled rest pose is part of authoritative game state.**

- `turn:throwResult` gains optional `restPose: BodyPose[]` — 5 dice in hand-index order,
  canonical table space, cup excluded, sampled at the roller's settle instant (kept dice
  already railed).
- `commitThrow` **soft-gates** it with the shared `validateRestPose`
  ([`shared/src/game/restPose.ts`](../../shared/src/game/restPose.ts)): shape, near-unit
  quaternions, inside `REST_POSE_BOUNDS`, and top faces equal to the reported dice. An
  invalid pose is dropped to `null` (with a server log line) but **never rejects the
  throw** — face values stay authoritative, which also keeps dev face overrides working.
- The validated pose rides the `rolled` event → persisted log entry (optional field, old
  logs parse), the `turn:rolled` broadcast, and the snapshot (`currentTurn.restPose`,
  `rollToBeat.restPose`; `stand()` copies the turn pose into `rollToBeat`).
- `turn:stand` may carry a final `restPose` sampled from the selecting layout. This covers
  dice the roller moved to the rail after the last settle; the server soft-gates it the
  same way, updates `currentTurn.restPose` before `stand()` copies it into `rollToBeat`,
  and persists it on the `stood` event (optional so old logs parse).
- Clients render settled dice through **one resolver** — `resolveTableRestPose`
  ([`staticPose.ts`](../../client/src/table3d/dice/staticPose.ts)): authoritative pose
  (rotated per viewer seat) → slot layout as an observable last resort (dev
  `console.warn` + `window.__diceDebug.slotFallbackCount`). It deliberately does **not**
  re-read faces from the pose — the server already guaranteed the match, and client-side
  re-checking was itself a fallback trigger.
- Both opportunistic capture paths (`useTableRoll` held-pose capture, `useRemoteRoll`
  stream capture) are **deleted**. Adding a new pose source means adding a tier to the
  resolver, never a new capture path.
- The quaternion→top-face convention moved to `shared` so the server validator and the
  client mesh cannot drift; `faceValue.test.ts` pins the three.js wrappers to it, and
  `diceLayout.test.ts` pins the layout constants inside `REST_POSE_BOUNDS`.

**Trust model:** unchanged from ADR 004 — the roller already reports the face values; the
pose is validated to agree with them and to be on the table, capping abuse at "cosmetically
odd but legal arrangement."

## Rejected alternatives

| Alternative | Why not |
|---|---|
| Harden the per-client captures (retries, looser face match) | Keeps N independent failure paths; the regression class survives. |
| Keep captures as a tier between server pose and slot layout | Same maintenance burden for a path that only runs when the server pose is absent — which the fallback already covers, observably. |
| Server persists the last `dice:frames` frame instead | Couples state to a lossy, rate-limited stream; `throwResult` is the one message that already marks the true settle instant. |

## Consequences

- Every viewer (including rejoiners and late joiners) sees the dice **where they landed**
  and, after a voluntary stand, where the hand was stood; the slot layout remains only for
  turns with no roll yet or an intentionally dropped pose.
- Kept dice render at the *roller's* rail for every viewer (matching live streaming); the
  old fallback railed them viewer-locally.
- ~600 B per `turn:rolled` / ~1.2 KB per snapshot — negligible next to the frame stream.
- `PersistedGame` is unchanged: compaction happens at round boundaries where no pose
  outlives the round; mid-round recovery replays `rolled { restPose? }`.

## Verification

- `npm test` — `shared/src/game/restPose.test.ts` (face reads, validation matrix),
  `engine.throw.test.ts` (store/drop, rollToBeat on stand + cap auto-stand, replay),
  `room.test.ts` (broadcast), `persistence.test.ts` (crash recovery),
  `staticPose.test.ts` (resolver priority, seat round-trip, fallback counter),
  `faceValue.test.ts` (client/server face parity), `diceLayout.test.ts` (bounds).
- Browser: two tabs; after each roll both tabs show the identical scatter, console shows
  no `[dice] slot-layout fallback` (see docs/browser-testing.md).

## See also

- [004 — Physics-authoritative rolls](./004-physics-authoritative-rolls.md)
