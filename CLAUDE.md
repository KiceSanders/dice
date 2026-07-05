# dice3 — multiplayer 3D dice game

npm workspaces monorepo: `shared` (types + protocol + pure game rules, consumed as raw TS),
`server` (express + ws, authoritative engine), `client` (React 19 + Vite + react-three-fiber).

## Commands

```bash
npm run dev              # server :3001 + client :5173 (one instance only)
npm run check            # typecheck all workspaces   (check:shared|server|client to scope)
npm test                 # all tests                  (test:shared|server|client to scope)
npm run lint             # biome check                (lint:fix to apply)
npm run verify           # lint + check + test — run before declaring work done
```

## Guardrails

1. **Keep the baseline green.** `npm run verify` passes on `main`; hooks re-check after
   every edit and on stop. Pre-existing failures don't exist — if you see one, you or your
   docs are stale; stop and investigate.
2. **Protocol/event changes** follow the ripple checklist in
   [docs/CODING_GUIDELINES.md](docs/CODING_GUIDELINES.md) §1 (or use the `protocol-change`
   skill). Edit `shared/src/protocol.ts` first and let the compiler produce the TODO list.
3. **Never park dead code.** Removing a feature removes its UI, reducer cases, validators,
   tests, and doc rows in the same change.
4. **Docs-sync is part of done:** rules → docs/GAME_RULES.md, messages → docs/PROTOCOL.md,
   data flow → docs/ARCHITECTURE.md, in the same commit.
5. **Commit only when asked.**

## Reading order

- [AGENTS.md](AGENTS.md) — full required-reading list and browser-verification duties
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — workspaces, the roll data flow, big-file map
- [docs/GAME_RULES.md](docs/GAME_RULES.md) — canonical rules (wilds, straights, sub-rounds)
- [docs/PROTOCOL.md](docs/PROTOCOL.md) — message tables + the three event vocabularies
- [docs/browser-testing.md](docs/browser-testing.md) — multi-tab flows before client work is "done"
- `PLAN.md` is the **phase/progress log only** — rules and protocol there were superseded by
  the docs above.
