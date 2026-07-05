# Coding Guidelines

House rules that keep this codebase safe to change — especially for AI agents. The build
enforces most of them; this file explains the ones it can't.

## 1. Protocol-change ripple checklist

Any change to a message or event union follows this order. (The `protocol-change`
skill/command walks it interactively — see [AGENTS.md § Skills and commands](../AGENTS.md#skills-and-commands).)

1. Edit **`shared/src/protocol.ts`** (and `shared/src/types.ts` if payload types change).
2. Run `npm run check` — **the compiler now hands you the TODO list.** Expect errors in:
   - `server/src/protocol.ts` — the validator table is `Record<ClientMessage['type'], …>`;
   - `server/src/handlers.ts` — `HandlerMap` keys are required;
   - `client/src/state/store.ts` — the reducer's `assertUnreachable` default.
   If you added a union member and see **no** errors, you edited the wrong union — stop.
3. Game-flow events additionally ripple `server/src/engine.ts` (`EngineEvent`) →
   `server/src/events.ts` (`RoomEvent`, if it must survive a crash — also the replay path in
   `persistence.ts`) → `room.ts onEngineEvent` (its `assertNever` forces this).
4. Turn-flow messages: check the socket-direct consumers `client/src/game/useTableRoll.ts`
   and `useRemoteRoll.ts` (they bypass the reducer).
5. Tests: `server/src/protocol.test.ts` plus the relevant `engine.*.test.ts`.
6. **Same commit:** update both tables and the three-vocabulary row in
   [docs/PROTOCOL.md](./PROTOCOL.md).

## 2. Exhaustiveness

- Never write a silent `default` (or no default) on a `switch` over a shared union.
  Server-side unions end with `default: assertNever(x, 'context')`; client-side handling of
  wire data ends with `default: { assertUnreachable(msg); return state; }` (unknown runtime
  messages from a newer server must be ignored, not crash).
- Never widen `HandlerMap` back to optional keys, and never remove the `assertNever` in
  `room.onEngineEvent` — they are what turns "forgot to wire it up" into a compile error.

## 3. File size

- New files: soft cap **400 lines**. Approaching it is a signal to split by responsibility.
- Files over ~600 lines (`DicePhysics.tsx`, `room.ts`, `engine.ts`, `Playground.tsx`) are
  **extract-only**: add behavior in a new module they call; do not grow them further.

## 4. No dead-code parking

Removing or replacing a feature means deleting its UI, state fields, reducer cases,
validators, tests, and doc rows **in the same change**. Cautionary tale: the straight-bonus
→ straight-payout refactor left a dead `BonusBanner`, a `turn:roll` button, 26 client type
errors, and a test suite pinned to a deleted API — which cost a full cleanup pass
(2026-07-04). Never keep an unreachable legacy path "just in case" — git history is the
just-in-case.

## 5. Test scoping

| You changed | Run |
|---|---|
| `shared/src/game/*` | `npm run test:shared` |
| engine / room / persistence | `npm run test:server` |
| 3D math (`table3d/*`) | `npm run test:client` |
| protocol shape | `npx vitest run server/src/protocol.test.ts` |
| anything before you stop | `npm run verify` (lint + typecheck + all tests) |
| live game behavior | `verify-game-flow` skill/command (smoke scripts + browser flows) |

Engine tests script dice with `server/src/engine.testkit.ts` — `roll(engine, id, dice,
keep)` performs one full throw with explicit faces. There is no rng to stub (ADR 004).

**Stale-test policy:** an API change lands together with its test updates, or it doesn't
land. Never skip, comment out, or loosen a failing test to get green — fix the code or fix
the test to assert the new intended behavior, and say which you did.

## 6. Formatting and lint

- Biome is the single formatter/linter: `npm run lint` to check, `npm run lint:fix` to
  apply. Never hand-format against it; never commit with lint errors.
- Suppressing a rule requires a line-scoped `// biome-ignore lint/<rule>: <reason>` — the
  reason is mandatory. Never disable a rule file-wide or repo-wide to silence one instance.
  (Repo-wide rule exceptions in `biome.json` are deliberate: index-keyed dice lists,
  hand-authored CSS cascade, non-null assertions under `noUncheckedIndexedAccess`.)

## 7. Docs-sync is part of definition of done

In the same commit as the code change:
- rules changed → [docs/GAME_RULES.md](./GAME_RULES.md)
- messages/events changed → [docs/PROTOCOL.md](./PROTOCOL.md)
- data flow / module layout changed → [docs/ARCHITECTURE.md](./ARCHITECTURE.md)
- a significant design decision → new ADR in [docs/decisions/](./decisions/)

A doc that lies is worse than no doc. If you notice drift you didn't cause, fix it or flag
it — don't code against the doc.

## 8. Verification ladder

From cheapest to most complete; a change must climb as high as its blast radius:

1. `npm run check:<workspace>` — after every edit (the PostToolUse hook does this for you).
2. Scoped tests (§5) — after each unit of work.
3. `npm run verify` — before you declare anything done (the Stop hook runs check+test).
4. Smoke scripts — any server game-logic/protocol change: `node server/scripts/smoke-ws.mjs`,
   `smoke-rooms.mjs`, `smoke-game.mjs` (needs `npm run dev` up), `smoke-recovery.mjs`
   (spawns its own server).
5. Multi-tab browser flows ([docs/browser-testing.md](./browser-testing.md)) — any client
   game-flow change; unit tests do not cover WebSocket + multi-tab behavior.
