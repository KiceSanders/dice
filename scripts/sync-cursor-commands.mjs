// Regenerates .cursor/commands/*.md from .claude/skills/*/SKILL.md so Cursor's slash
// commands stay in sync with Claude Code's skills. Run via `npm run sync:cursor`, or
// automatically from the post-edit hook when a skill file changes (see
// scripts/hooks/lib/checks.mjs maybeSyncCursorCommands).
//
// Do not hand-edit files under .cursor/commands/ — edit the source skill and regenerate.
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.argv[2] ?? process.cwd();
const skillsDir = join(root, '.claude/skills');
const commandsDir = join(root, '.cursor/commands');

if (!existsSync(skillsDir)) process.exit(0);
mkdirSync(commandsDir, { recursive: true });

for (const name of readdirSync(skillsDir)) {
  const skillPath = join(skillsDir, name, 'SKILL.md');
  if (!existsSync(skillPath)) continue;

  const raw = readFileSync(skillPath, 'utf8');
  const body = raw.replace(/^---\n[\s\S]*?\n---\n/, '').trimStart();
  const banner = `<!-- Generated from .claude/skills/${name}/SKILL.md by scripts/sync-cursor-commands.mjs.
     Do not hand-edit — edit the source skill and run \`npm run sync:cursor\`. -->\n\n`;

  writeFileSync(join(commandsDir, `${name}.md`), banner + body);
}
