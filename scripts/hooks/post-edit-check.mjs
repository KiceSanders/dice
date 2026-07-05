// Claude Code PostToolUse hook (Edit|Write): lint the edited file and typecheck
// its workspace. Exit 2 blocks the edit and feeds stderr back to the agent —
// the fastest feedback loop we have. See .claude/settings.json.
import { execSync } from 'node:child_process';
import { relative } from 'node:path';

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
if (!filePath || !/\.(ts|tsx)$/.test(filePath)) process.exit(0);

const rel = relative(root, filePath);
if (rel.startsWith('..')) process.exit(0);
const workspace = ['shared', 'server', 'client'].find((w) => rel.startsWith(`${w}/`));
if (!workspace) process.exit(0);

const failures = [];
const run = (cmd) => {
  try {
    execSync(cmd, { cwd: root, stdio: 'pipe', timeout: 60_000 });
  } catch (err) {
    failures.push(`$ ${cmd}\n${err.stdout ?? ''}${err.stderr ?? ''}`);
  }
};

run(`npx biome check "${rel}"`);
run(`npm run check:${workspace} --silent`);

// The shared contract touches both sides — typecheck them all and point at the checklist.
if (rel === 'shared/src/protocol.ts' || rel === 'shared/src/types.ts') {
  for (const w of ['server', 'client']) if (w !== workspace) run(`npm run check:${w} --silent`);
  if (failures.length > 0) {
    failures.push(
      'Protocol/types touched — follow the ripple checklist in docs/CODING_GUIDELINES.md §1 (or the protocol-change skill).',
    );
  }
}

if (failures.length > 0) {
  process.stderr.write(failures.join('\n\n'));
  process.exit(2); // blocking: errors are fed back to the agent
}
process.exit(0);
