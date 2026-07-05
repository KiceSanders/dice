#!/bin/sh
# Claude Code Stop hook: the turn may not end red. Runs typecheck + full tests;
# exit 2 sends the failure back to the agent to fix before stopping.
# If per-turn latency ever becomes annoying, drop this hook and rely on the
# PostToolUse hook + .githooks/pre-commit + `npm run verify`.

# Loop guard: if we're already continuing because this hook fired, let it stop.
INPUT=$(cat)
case "$INPUT" in
  *'"stop_hook_active":true'*) exit 0 ;;
esac

cd "${CLAUDE_PROJECT_DIR:-.}" || exit 0

OUT=$(npm run check 2>&1) || {
  printf 'Stop blocked — typecheck is red:\n%s\n' "$(printf '%s' "$OUT" | tail -30)" >&2
  exit 2
}
OUT=$(npx vitest run 2>&1) || {
  printf 'Stop blocked — tests are red:\n%s\n' "$(printf '%s' "$OUT" | tail -30)" >&2
  exit 2
}
exit 0
