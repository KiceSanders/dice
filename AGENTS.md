# Agent guide — dice3

Read this file when working on the multiplayer dice game codebase.

## Required reading

1. **[PLAN.md](./PLAN.md)** — game rules, protocol, phased checklist (source of truth).
2. **[docs/browser-testing.md](./docs/browser-testing.md)** — **multi-tab browser verification** for Phase 7+ client work.
3. **[docs/decisions/](./docs/decisions/)** — architecture decision records (ADRs); read before changing 3D physics, colliders, or table/cup geometry.

## Before marking a client phase done

```bash
npm run check
npm test
npm run dev   # single instance on :5173 + :3001
```

Then run the browser flows in [docs/browser-testing.md](./docs/browser-testing.md) for the phase you completed:

| Phase | Browser doc section |
|-------|---------------------|
| 7 — Client foundation | [Phase 7 (2 tabs)](./docs/browser-testing.md#phase-7--client-foundation-2-tabs) |
| 8 — Lobby UI | [Phase 8 (3 tabs)](./docs/browser-testing.md#phase-8--lobby-ui-3-tabs) |

Do not skip browser verification for Phase 7/8 — unit tests do not cover WebSocket + multi-tab `localStorage` behavior.

## Quick reminders

- **One dev stack** on `localhost:5173` (client) and `localhost:3001` (server). Kill stale Vite/node processes if ports drift.
- **Wait for `Connection: open`** before creating or joining a room.
- **Multi-tab players:** set `localStorage.setItem('dice:name', '<name>')` per tab; rejoin tokens are scoped by stored `playerName`.
- **Commits:** only when the user asks. Check off tasks in `PLAN.md` in the same change that completes them.
