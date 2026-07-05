// Shared check logic for both hook ecosystems in this repo:
//   - Claude Code: scripts/hooks/post-edit-check.mjs, scripts/hooks/stop-verify.mjs
//   - Cursor:      .cursor/hooks/post-edit-check.mjs, .cursor/hooks/stop-verify.mjs
// Keep behavior here, not in the entrypoints — the entrypoints only differ in how they
// read stdin and how they report back (blocking exit code vs. observational stdout).
import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join, relative } from 'node:path';

const WORKSPACES = ['shared', 'server', 'client'];

function run(cmd, root, failures) {
  try {
    execSync(cmd, { cwd: root, stdio: 'pipe', timeout: 60_000 });
  } catch (err) {
    failures.push(`$ ${cmd}\n${err.stdout ?? ''}${err.stderr ?? ''}`);
  }
}

/** Lint + typecheck the edited file's workspace. Returns an array of failure strings. */
export function postEditChecks(root, filePath) {
  if (!filePath || !/\.(ts|tsx)$/.test(filePath)) return [];
  const rel = relative(root, filePath);
  if (rel.startsWith('..')) return [];
  const workspace = WORKSPACES.find((w) => rel.startsWith(`${w}/`));
  if (!workspace) return [];

  const failures = [];
  run(`npx biome check "${rel}"`, root, failures);
  run(`npm run check:${workspace} --silent`, root, failures);

  if (rel === 'shared/src/protocol.ts' || rel === 'shared/src/types.ts') {
    for (const w of WORKSPACES) {
      if (w !== workspace) run(`npm run check:${w} --silent`, root, failures);
    }
    if (failures.length > 0) {
      failures.push(
        'Protocol/types touched — follow the ripple checklist in docs/CODING_GUIDELINES.md §1 (or the protocol-change skill/command).',
      );
    }
  }
  return failures;
}

/** Typecheck + full test suite. Returns an array of failure strings (empty = green). */
export function stopChecks(root) {
  const failures = [];
  try {
    execSync('npm run check', { cwd: root, stdio: 'pipe', timeout: 180_000 });
  } catch (err) {
    const out = `${err.stdout ?? ''}${err.stderr ?? ''}`;
    failures.push(`typecheck is red:\n${out.split('\n').slice(-30).join('\n')}`);
    return failures;
  }
  try {
    execSync('npx vitest run', { cwd: root, stdio: 'pipe', timeout: 180_000 });
  } catch (err) {
    const out = `${err.stdout ?? ''}${err.stderr ?? ''}`;
    failures.push(`tests are red:\n${out.split('\n').slice(-30).join('\n')}`);
  }
  return failures;
}

/**
 * If the edited file is a Claude Code skill, regenerate the mirrored Cursor
 * commands so the two stay in sync without a manual step. Best-effort: a
 * failure here surfaces on the next `npm run verify`, not as a hook error.
 */
export function maybeSyncCursorCommands(root, filePath) {
  if (!filePath) return;
  const rel = relative(root, filePath);
  if (!rel.startsWith('.claude/skills/') || !rel.endsWith('SKILL.md')) return;
  const generator = join(root, 'scripts/sync-cursor-commands.mjs');
  if (!existsSync(generator)) return;
  try {
    execSync(`node "${generator}" "${root}"`, { cwd: root, stdio: 'pipe', timeout: 10_000 });
  } catch {
    // best-effort
  }
}
