---
name: verify-game-flow
description: >
  End-to-end verification of multiplayer game behavior over real websockets and
  the browser. Use before declaring any server game-logic, room, protocol, or
  client game-flow change done — unit tests do not cover WebSocket + multi-tab
  behavior.
---

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

Browser verification is user-owned by default. After implementation, automated checks,
and smoke scripts are complete, hand the user the relevant section of
`docs/browser-testing.md`. Never launch or drive browser testing unless the user explicitly
asks. If explicitly asked, essentials are:

- One dev stack only (:5173 / :3001).
- Per tab: `localStorage.setItem('dice:name', '<name>')`, then wait for
  **Connection: open** before creating/joining.
- Rejoin tokens are scoped by stored `playerName` — reusing a name reclaims that identity.

## Done means

All four smoke scripts pass and the relevant browser checklist has been handed to the user.
Do not claim browser verification passed until the user reports the result. If the user
explicitly asks the agent to drive it, report which flows ran and what was observed — not
just "tests pass".
