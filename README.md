# Multiplayer Dice

Real-time, browser-based dice game for up to 8 players per room. Roll 5 dice, keep and re-roll to beat the roll-to-beat, win the pot. Ties spawn doubled-bet sub-rounds; straights pay configurable bonuses.

**→ See [PLAN.md](./PLAN.md) for the full game rules, architecture, WebSocket protocol, and the phased development checklist.**

**Agents:** see [AGENTS.md](./AGENTS.md) and [docs/browser-testing.md](./docs/browser-testing.md) for multi-tab browser verification (Phase 7+).

## Stack

- **`shared/`** — TypeScript types, WebSocket protocol, pure game logic (Vitest-tested)
- **`server/`** — Node.js, express + `ws`, in-memory state with append-only log recovery
- **`client/`** — React 19 + Vite

## Getting started

Requires Node.js 20+.

```bash
npm install
npm run dev        # server on :3001, client on :5173 (with proxy)
```

Other scripts:

```bash
npm run check      # typecheck all workspaces
npm test           # run all unit/integration tests
npm run build      # production build: shared (typecheck) → server (bundle) → client
npm start          # production: serve client + WS from one port (3001)
```

## Production build & run

```bash
npm run build
npm start          # http://localhost:3001
```

`npm run build` typechecks `shared/`, bundles the server (esbuild, including the
shared game logic) into `server/dist/index.js`, and builds the client into
`client/dist/`. `npm start` runs the bundled server with `NODE_ENV=production`,
which serves the built client statically (SPA fallback included) and handles
WebSockets on the same port — everything on `http://localhost:3001`.

- `PORT` — listen port (default `3001`)
- `LOG_DIR` — room event-log directory (default `server/logs/`); logs let
  in-progress rooms survive a restart, so persist this directory in production

