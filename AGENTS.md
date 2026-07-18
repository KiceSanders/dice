# Agent guide — dice

npm workspaces monorepo: `shared` (types + protocol + pure game rules, consumed as raw TS),
`server` (express + ws, authoritative engine), `client` (React 19 + Vite + react-three-fiber).

Read this file when working on the multiplayer dice game codebase. Cursor reads it
automatically; Claude Code reads it via the `@AGENTS.md` import in [CLAUDE.md](./CLAUDE.md).

## Commands

```bash
npm run dev              # server :3001 + client :5173 (one instance only)
npm run check            # typecheck all workspaces   (check:shared|server|client to scope)
npm test                 # all tests                  (test:shared|server|client to scope)
npm run lint             # biome check                (lint:fix to apply)
npm run verify           # lint + check + test — run before declaring work done
```

## Required reading

1. **[docs/GAME_RULES.md](./docs/GAME_RULES.md)** — canonical game rules (source of truth).
2. **[docs/PROTOCOL.md](./docs/PROTOCOL.md)** — WebSocket contract + the three event
   vocabularies; must be updated in the same commit as any protocol change.
3. **[docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md)** — workspaces, the roll data flow,
   which files are extract-only.
4. **[docs/CODING_GUIDELINES.md](./docs/CODING_GUIDELINES.md)** — ripple checklist,
   exhaustiveness rules, test scoping, docs-sync.
5. **[docs/browser-testing.md](./docs/browser-testing.md)** — multi-tab browser
   verification for client work.
6. **[docs/TABLE_UI.md](./docs/TABLE_UI.md)** — REQUIRED before table UI work (visuals,
   effects, chips, skins, new 3D props, layout): the three-renderer rule, table events,
   framing anchors, theme, and the DicePhysics edit rules.
7. **[docs/decisions/](./docs/decisions/)** — ADRs; read before changing 3D physics,
   colliders, table/cup geometry, or the roll protocol (ADR 004).

[PLAN.md](./PLAN.md) is the phase/progress log — check off tasks there, but do not treat
its prose as rules; the docs above are canonical.

## Guardrails

1. **Keep the baseline green.** `npm run verify` passes on `main`. Both agent tools
   re-check work automatically — see [Hooks](#hooks) below. Pre-existing failures don't
   exist — if you see one, you or your docs are stale; stop and investigate.
2. **Protocol/event changes** follow the ripple checklist in
   [docs/CODING_GUIDELINES.md](docs/CODING_GUIDELINES.md) §1 (or the `protocol-change`
   skill/command). Edit `shared/src/protocol.ts` first and let the compiler produce the
   TODO list.
3. **Never park dead code.** Removing a feature removes its UI, reducer cases, validators,
   tests, and doc rows in the same change.
4. **Docs-sync is part of done:** rules → docs/GAME_RULES.md, messages → docs/PROTOCOL.md,
   data flow → docs/ARCHITECTURE.md, in the same commit.
5. **Commit only when asked.**

## Before marking work done

```bash
npm run verify   # lint + typecheck all workspaces + full test suite
```

Server game-logic or protocol changes: also run the smoke scripts
(`node server/scripts/smoke-ws.mjs`, `smoke-rooms.mjs`, `smoke-game.mjs` against
`npm run dev`, `smoke-recovery.mjs` standalone) — the `verify-game-flow` skill/command
wraps this.

Client game-flow changes: complete code, automated checks, and smoke scripts first, then
hand the user the relevant multi-tab checklist from
[docs/browser-testing.md](./docs/browser-testing.md). **Never launch or drive browser
testing unless the user explicitly asks you to do so.** The user owns browser verification
by default:

| Area | Browser doc section |
|-------|---------------------|
| Client foundation | [Phase 7 (2 tabs)](./docs/browser-testing.md#phase-7--client-foundation-2-tabs) |
| Lobby UI | [Phase 8 (3 tabs)](./docs/browser-testing.md#phase-8--lobby-ui-3-tabs) |

Do not claim browser verification passed without the user's results — unit tests do not
cover WebSocket + multi-tab `localStorage` behavior.

## Quick reminders

- **One dev stack** on `localhost:5173` (client) and `localhost:3001` (server). Kill stale
  Vite/node processes if ports drift.
- **Wait for `Connection: open`** before creating or joining a room.
- **Multi-tab players:** set `localStorage.setItem('dice:name', '<name>')` per tab; rejoin
  tokens are scoped by stored `playerName`.
- **Commits:** only when the user asks. Check off tasks in `PLAN.md` in the same change
  that completes them.

## Skills and commands

Repeatable procedures are written once as Claude Code skills and mirrored to Cursor
commands so both tools get the same procedure:

| Purpose | Claude Code | Cursor |
|---|---|---|
| Protocol/event change ripple | `protocol-change` skill | `/protocol-change` |
| Game rule change | `game-rule-change` skill | `/game-rule-change` |
| Table UI / visual / effect change | `table-ui-change` skill | `/table-ui-change` |
| End-to-end multi-tab verification | `verify-game-flow` skill | `/verify-game-flow` |

Source of truth is `.claude/skills/*/SKILL.md`. `.cursor/commands/*.md` is **generated** by
`scripts/sync-cursor-commands.mjs` — edit the skill, never the generated command file. The
post-edit hook (both tools) regenerates automatically when a `SKILL.md` changes; run
`npm run sync:cursor` to do it manually.

## Hooks

Both tools enforce the same two checkpoints via `scripts/hooks/lib/checks.mjs` (single
source of the actual check logic):

| Checkpoint | Claude Code (`.claude/settings.json`) | Cursor (`.cursor/hooks.json`) |
|---|---|---|
| After an edit | `post-edit-check.mjs` — **blocks** (exit 2) on lint/typecheck failure | `post-edit-check.mjs` — **advisory only**; Cursor's `afterFileEdit` can't block |
| Before the agent stops | `stop-verify.mjs` — **blocks** (exit 2) until `npm run check` + tests are green | `stop-verify.mjs` — resubmits a `followup_message` until green (capped by `loop_limit`) |

The practical effect is the same at the end of a turn (nothing ships red); Cursor is just
looser on the fast per-edit gate. If you change the check logic, edit
`scripts/hooks/lib/checks.mjs` once — both entrypoints on both sides call it.
