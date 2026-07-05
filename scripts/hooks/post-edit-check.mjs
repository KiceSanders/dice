// Claude Code PostToolUse hook (Edit|Write): lint the edited file and typecheck
// its workspace. Exit 2 blocks the edit and feeds stderr back to the agent —
// the fastest feedback loop we have. See .claude/settings.json.
//
// Check logic lives in scripts/hooks/lib/checks.mjs, shared with the Cursor mirror at
// .cursor/hooks/post-edit-check.mjs (which is observational only — Cursor's afterFileEdit
// hook can't block).
import { maybeSyncCursorCommands, postEditChecks } from './lib/checks.mjs';

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
  process.exit(0);
}

let filePath;
try {
  filePath = JSON.parse(input)?.tool_input?.file_path;
} catch {
  process.exit(0);
}

maybeSyncCursorCommands(root, filePath);

const failures = postEditChecks(root, filePath);
if (failures.length > 0) {
  process.stderr.write(failures.join('\n\n'));
  process.exit(2); // blocking: errors are fed back to the agent
}
process.exit(0);
