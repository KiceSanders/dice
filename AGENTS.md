# Agent guide — dice3

Read this file when working on the multiplayer dice game codebase.

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
6. **[docs/decisions/](./docs/decisions/)** — ADRs; read before changing 3D physics,
   colliders, table/cup geometry, or the roll protocol (ADR 004).

[PLAN.md](./PLAN.md) is the phase/progress log — check off tasks there, but do not treat
its prose as rules; the docs above are canonical.

## Before marking work done

```bash
npm run verify   # lint + typecheck all workspaces + full test suite
```

Server game-logic or protocol changes: also run the smoke scripts
(`node server/scripts/smoke-ws.mjs`, `smoke-rooms.mjs`, `smoke-game.mjs` against
`npm run dev`, `smoke-recovery.mjs` standalone) — the `verify-game-flow` skill wraps this.

Client game-flow changes: run the relevant multi-tab flows in
[docs/browser-testing.md](./docs/browser-testing.md):

| Area | Browser doc section |
|-------|---------------------|
| Client foundation | [Phase 7 (2 tabs)](./docs/browser-testing.md#phase-7--client-foundation-2-tabs) |
| Lobby UI | [Phase 8 (3 tabs)](./docs/browser-testing.md#phase-8--lobby-ui-3-tabs) |

Do not skip browser verification — unit tests do not cover WebSocket + multi-tab
`localStorage` behavior.

## Quick reminders

- **One dev stack** on `localhost:5173` (client) and `localhost:3001` (server). Kill stale
  Vite/node processes if ports drift.
- **Wait for `Connection: open`** before creating or joining a room.
- **Multi-tab players:** set `localStorage.setItem('dice:name', '<name>')` per tab; rejoin
  tokens are scoped by stored `playerName`.
- **Commits:** only when the user asks. Check off tasks in `PLAN.md` in the same change
  that completes them.
