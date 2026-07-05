<!-- Generated from .claude/skills/game-rule-change/SKILL.md by scripts/sync-cursor-commands.mjs.
     Do not hand-edit — edit the source skill and run `npm run sync:cursor`. -->

# Game rule change

1. **Read the current rule** in `docs/GAME_RULES.md` and confirm the change with the task.
   If the requested rule contradicts the doc, flag it — don't silently reinterpret.
2. **Pure logic first**: rules live in `shared/src/game/*` (score/compare/resolve/stand —
   pure functions, colocated tests). Change them there; never inline rule logic in
   `server/src/engine.ts`.
3. **Engine integration**: wire the rule through `engine.ts` if turn/round flow changes.
   Engine tests script dice explicitly via `server/src/engine.testkit.ts` —
   `roll(engine, id, dice, keep)` performs one full throw; there is no rng (ADR 004).
   Chip-flow rules (payouts, antes) belong in the engine and must stay **zero-sum unless
   the rule says otherwise** — add a chips-conservation assertion to the test.
4. **Settings ripple**: if the rule is configurable, `RoomSettings` in
   `shared/src/types.ts` → `clampSettings` + validators (`server/src/protocol.ts`) →
   `client/src/components/SettingsFields.tsx` → the settings table in GAME_RULES.md.
5. **Watch the stand gate**: `canStandVoluntarily` is evaluated on **both** client
   (turn controls) and server (engine) — a rule change that affects hand strength changes
   when standing is legal on both sides.
6. **Same commit**: update `docs/GAME_RULES.md`.
7. Verify: `npm run test:shared && npm run test:server`, then `npm run verify`; for
   chip-flow changes run the `verify-game-flow` skill (smoke-game asserts conservation).
