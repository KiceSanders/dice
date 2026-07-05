// Cursor stop hook — mirrors scripts/hooks/stop-verify.mjs (Claude Code).
// Cursor's `stop` hook has no exit-2 blocking; a non-empty `followup_message` is
// resubmitted as the next user message instead, capped by loop_limit in
// .cursor/hooks.json (mirrors the stop_hook_active loop guard on the Claude side).
import { stopChecks } from '../../scripts/hooks/lib/checks.mjs';

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
  input = '{}';
}

let parsed = {};
try {
  parsed = JSON.parse(input);
} catch {
  // fall through with defaults
}

const root = parsed?.workspace_roots?.[0] ?? process.cwd();
const failures = stopChecks(root);

if (failures.length > 0) {
  process.stdout.write(
    JSON.stringify({
      followup_message: `Fix before finishing — \`npm run verify\` is red:\n\n${failures.join('\n\n')}`,
    }),
  );
}
process.exit(0);
