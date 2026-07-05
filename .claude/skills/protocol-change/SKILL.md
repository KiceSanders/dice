---
name: protocol-change
description: >
  Add, remove, or rename a WebSocket message or game event in the dice game.
  Use whenever editing the ClientMessage/ServerMessage unions in
  shared/src/protocol.ts, the EngineEvent union in server/src/engine.ts, or the
  RoomEvent union in server/src/events.ts — or when a task mentions a new
  player action, game event, or broadcast.
---

# Protocol change

Walk the ripple checklist (docs/CODING_GUIDELINES.md §1) as an executable procedure. The
type system is rigged so each step's omission is a compile error — trust the errors.

1. **Edit the wire contract first**: `shared/src/protocol.ts` (+ `shared/src/types.ts` if
   payload types change).
2. Run `npm run check`. **Expect errors** — they are your TODO list:
   - `server/src/protocol.ts` → add a validator (the table is
     `Record<ClientMessage['type'], Validator>`);
   - `server/src/handlers.ts` → add a handler (`HandlerMap` keys are required);
   - `client/src/state/store.ts` → add a reducer case (the `assertUnreachable` default
     flags the missing one).

   If you added a union member and `npm run check` passes untouched, you edited the wrong
   union — stop and re-read step 1.
3. **Game-flow events** ripple further: `server/src/engine.ts` (`EngineEvent`) →
   `server/src/events.ts` (`RoomEvent`) **only if the event must survive a crash** (then
   also the replay path in `server/src/persistence.ts` `applyReplayEvent`) →
   `server/src/room.ts` `onEngineEvent` (its `assertNever` default forces the mapping).
4. **Turn-flow messages**: check `client/src/game/useTableRoll.ts` and `useRemoteRoll.ts` —
   they consume socket messages directly, bypassing the reducer, so the compiler cannot
   point there.
5. **Tests**: update `server/src/protocol.test.ts` (accept + reject cases) and the relevant
   `server/src/engine.*.test.ts` (script dice via `engine.testkit.ts`).
6. **Same commit**: update `docs/PROTOCOL.md` — both message tables AND the
   three-vocabulary table row.
7. Finish with `npm run verify`. If the change affects live play, run the
   `verify-game-flow` skill.
