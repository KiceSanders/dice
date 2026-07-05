<!-- Generated from .claude/skills/verify-game-flow/SKILL.md by scripts/sync-cursor-commands.mjs.
     Do not hand-edit — edit the source skill and run `npm run sync:cursor`. -->

# Verify game flow

## 1. Smoke scripts (the protocol's executable spec)

`smoke-recovery.mjs` spawns its own server; the others need a live one:

```bash
npm run dev            # from repo root; server :3001 + client :5173
# wait for both to report ready; kill stale node/vite processes if ports drift
```

Run in order, from `server/`:

| Script | Proves | Expected |
|---|---|---|
| `node scripts/smoke-ws.mjs` | transport + validation errors | all `ok:` lines, exit 0 |
| `node scripts/smoke-rooms.mjs` | join/seat/approve/kick/host-transfer | all `ok:` lines, exit 0 |
| `node scripts/smoke-game.mjs` | a full round via `turn:throwStart`/`throwResult`, roll-cap pressure, chips conserved | `game smoke test passed` |
| `node scripts/smoke-recovery.mjs` | SIGKILL mid-round → token rejoin → play continues | `recovery smoke test passed` |

If a script hangs or fails with `EADDRINUSE`, kill leftovers first:
`lsof -t -i tcp:3001 -i tcp:3017 | xargs kill -9`.

## 2. Multi-tab browser flows

Follow the relevant section of `docs/browser-testing.md`. Essentials:

- One dev stack only (:5173 / :3001).
- Per tab: `localStorage.setItem('dice:name', '<name>')`, then wait for
  **Connection: open** before creating/joining.
- Rejoin tokens are scoped by stored `playerName` — reusing a name reclaims that identity.

## Done means

All four smoke scripts pass AND the relevant browser section was actually driven and
observed (state stays in sync across tabs after a hard-refresh rejoin). Report which flows
you ran and what you saw — not just "tests pass".
