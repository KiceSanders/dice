# Multiplayer Dice

Real-time, browser-based dice game for 2–8 seated players per room (plus spectators). Roll 5 dice from a physics-simulated cup, keep and re-roll to beat the roll-to-beat, win the pot. Ties spawn doubled-bet sub-rounds; rolling a straight makes every other seated player pay you on the spot.

**→ Rules: [docs/GAME_RULES.md](./docs/GAME_RULES.md) · Protocol: [docs/PROTOCOL.md](./docs/PROTOCOL.md) · Architecture: [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) · Deployment: [docs/DEPLOYMENT.md](./docs/DEPLOYMENT.md) · Progress log: [PLAN.md](./PLAN.md)**

**Agents:** start at [AGENTS.md](./AGENTS.md) (reading list, verification duties) and [docs/CODING_GUIDELINES.md](./docs/CODING_GUIDELINES.md).

## Stack

- **`shared/`** — TypeScript types, WebSocket protocol, pure game logic (Vitest-tested)
- **`server/`** — Node.js, express + `ws`, in-memory state with append-only log recovery
- **`client/`** — React 19 + Vite

## Getting started

Requires Node.js 20.19+ (or Node.js 22+).

```bash
npm install
npm run dev        # server on :3001, client on :5173 (with proxy)
```

Other scripts:

```bash
npm run check      # typecheck all workspaces (check:shared|server|client to scope)
npm test           # run all unit/integration tests (test:shared|server|client to scope)
npm run lint       # biome lint + format check (lint:fix to apply)
npm run verify     # lint + check + test — the pre-done gate
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
- `HOST` — optional listen host (the container sets `0.0.0.0`)
- `LOG_DIR` — room event-log directory (default `server/logs/`); logs let
  in-progress rooms survive a restart, so persist this directory in production
- `ALLOWED_ORIGINS` — optional comma-separated extra browser origins; same-origin
  WebSockets are accepted automatically

For a container build, run `docker build -t dice .` and mount persistent storage at
`/data`. See [docs/DEPLOYMENT.md](./docs/DEPLOYMENT.md) for the production runtime contract.
