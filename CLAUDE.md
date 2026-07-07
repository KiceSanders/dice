@AGENTS.md

## Claude Code specifics

- Hooks in `.claude/settings.json` run `scripts/hooks/post-edit-check.mjs` (blocking) after
  every Edit/Write and `scripts/hooks/stop-verify.mjs` (blocking) on Stop. Both call into
  `scripts/hooks/lib/checks.mjs` — see [AGENTS.md § Hooks](AGENTS.md#hooks) for how this
  maps to the Cursor side.
- Skills live in `.claude/skills/*/SKILL.md` and are mirrored to `.cursor/commands/` — edit
  the skill, never the generated command file (see
  [AGENTS.md § Skills and commands](AGENTS.md#skills-and-commands)).

## Reading order

- [AGENTS.md](AGENTS.md) — commands, required reading, guardrails, hooks, skills/commands map
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — workspaces, the roll data flow, big-file map
- [docs/GAME_RULES.md](docs/GAME_RULES.md) — canonical rules (wilds, straights, sub-rounds)
- [docs/PROTOCOL.md](docs/PROTOCOL.md) — message tables + the three event vocabularies
- [docs/TABLE_UI.md](docs/TABLE_UI.md) — table UI rulebook (read before visuals/effects/props work)
- [docs/browser-testing.md](docs/browser-testing.md) — multi-tab flows before client work is "done"
- `PLAN.md` is the **phase/progress log only** — rules and protocol there were superseded by
  the docs above.
