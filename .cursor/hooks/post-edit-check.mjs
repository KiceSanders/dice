// Cursor afterFileEdit hook — mirrors scripts/hooks/post-edit-check.mjs (Claude Code).
// Cursor's afterFileEdit hook has no output/blocking mechanism (observational only), so
// failures are surfaced to stderr for visibility only; they don't stop the edit. The
// `stop` hook (stop-verify.mjs) is the real gate on this side. See .cursor/hooks.json.
import { maybeSyncCursorCommands, postEditChecks } from '../../scripts/hooks/lib/checks.mjs';

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
  process.exit(0);
}

let parsed;
try {
  parsed = JSON.parse(input);
} catch {
  process.exit(0);
}

const root = parsed?.workspace_roots?.[0] ?? process.cwd();
const filePath = parsed?.file_path;

maybeSyncCursorCommands(root, filePath);

const failures = postEditChecks(root, filePath);
if (failures.length > 0) {
  process.stderr.write(failures.join('\n\n'));
}
process.exit(0);
