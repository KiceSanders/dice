// Claude Code Stop hook: the turn may not end red. Runs typecheck + full tests;
// exit 2 sends the failure back to the agent to fix before stopping.
// If per-turn latency ever becomes annoying, drop this hook and rely on the
// PostToolUse hook + .githooks/pre-commit + `npm run verify`.
//
// Check logic lives in scripts/hooks/lib/checks.mjs, shared with the Cursor mirror at
// .cursor/hooks/stop-verify.mjs (which reports via followup_message instead of exit 2).
import { stopChecks } from './lib/checks.mjs';

const root = process.env.CLAUDE_PROJECT_DIR ?? process.cwd();

let input = '';
try {
  input = await new Promise((resolve, reject) => {
    let data = '';
    process.stdin.on('data', (c) => {
      data += c;
    });
    process.stdin.on('end', () => resolve(data));
    process.stdin.on('error', reject);
  });
} catch {
  input = '';
}

// Loop guard: if we're already continuing because this hook fired, let it stop.
if (input.includes('"stop_hook_active":true')) process.exit(0);

const failures = stopChecks(root);
if (failures.length > 0) {
  process.stderr.write(`Stop blocked — ${failures.join('\n\n')}`);
  process.exit(2);
}
process.exit(0);
