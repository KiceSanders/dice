import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createVisualFixture, visualTestUrl } from '../test/visual-betalot-fixture.js';
import { visualScenarios } from '../test/visual-betalot-scenarios.js';
import {
  blackjackVisualScenarios,
  createBlackjackVisualFixture,
} from '../test/visual-blackjack-fixture.js';

const [scenarioName = 'list', destination = `artifacts/betalot/${Date.now()}`] =
  process.argv.slice(2);
if (scenarioName === 'list') {
  console.log(
    Object.entries({ ...visualScenarios, ...blackjackVisualScenarios })
      .map(([name, scenario]) => `${name}: ${scenario.description}`)
      .join('\n'),
  );
} else {
  const kind = scenarioName.startsWith('blackjack-') ? 'blackjack' : 'betalot';
  const fixture =
    kind === 'blackjack'
      ? await createBlackjackVisualFixture('ws://localhost:3001/ws', scenarioName)
      : await createVisualFixture('ws://localhost:3001/ws', scenarioName);
  const directory = resolve(destination);
  await mkdir(directory, { recursive: true });
  const manifest = {
    fixturePid: process.pid,
    scenario: scenarioName,
    kind,
    roomId: fixture.roomId,
    description: fixture.scenario.description,
    actor: fixture.identities[fixture.actor]!.playerName,
    call: kind === 'betalot' ? (fixture.scenario.call ?? 6) : null,
    decisions: 'decisions' in fixture.scenario ? fixture.scenario.decisions : [],
    throws: fixture.scenario.rolls,
    review: fixture.scenario.review,
    before: fixture.snapshot,
    players: fixture.identities.map((identity, i) => ({
      name: identity.playerName,
      role: i === fixture.actor ? 'actor' : i === 2 ? 'spectator' : 'opponent',
      url: visualTestUrl(
        'http://localhost:5173',
        fixture.roomId,
        identity,
        i === fixture.actor ? fixture.scenario.rolls : [],
        kind,
      ),
    })),
  };
  await writeFile(resolve(directory, 'setup.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  const { before: _before, ...instructions } = manifest;
  console.log(
    JSON.stringify({ setup: resolve(directory, 'setup.json'), ...instructions }, null, 2),
  );
  console.log(
    'Fixture ready. Keep this process running while using the browser; stop it after closing test tabs. Expires in 20 minutes.',
  );
  const timer = setTimeout(() => {
    fixture.close();
    process.exit(0);
  }, 20 * 60_000);
  const stop = () => {
    clearTimeout(timer);
    fixture.close();
    process.exit(0);
  };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
}
