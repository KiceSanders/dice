// Phase 6 smoke test: kill -9 the server mid-round and confirm rejoin works.
// Spawns its own server (tsx src/index.ts) on PORT with a temp LOG_DIR.
// Usage: node scripts/smoke-recovery.mjs
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';

const PORT = process.env.PORT ?? '3017';
const url = `ws://localhost:${PORT}`;
const serverDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const logDir = mkdtempSync(path.join(os.tmpdir(), 'dice-smoke-logs-'));

let failures = 0;
function assert(cond, label) {
  if (!cond) {
    failures++;
    console.error(`FAIL: ${label}`);
  } else {
    console.log(`ok: ${label}`);
  }
}

function startServer() {
  // Spawn node+tsx directly (not via npx): SIGKILL must hit the server process
  // itself, or the real server survives as an orphan and squats on the port.
  const child = spawn(process.execPath, ['--import', 'tsx', 'src/index.ts'], {
    cwd: serverDir,
    env: { ...process.env, PORT, LOG_DIR: logDir },
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('server did not start')), 15000);
    child.stdout.on('data', (chunk) => {
      if (String(chunk).includes('listening')) {
        clearTimeout(t);
        resolve(child);
      }
    });
    child.on('exit', (code) => reject(new Error(`server exited early (${code})`)));
  });
}

function client(name) {
  const ws = new WebSocket(url);
  const buffer = [];
  const waiters = [];
  ws.on('message', (raw) => {
    const msg = JSON.parse(String(raw));
    const i = waiters.findIndex((w) => w.match(msg));
    if (i >= 0) waiters.splice(i, 1)[0].resolve(msg);
    else buffer.push(msg);
  });
  const waitFor = (match, label, timeoutMs = 4000) => {
    const i = buffer.findIndex(match);
    if (i >= 0) return Promise.resolve(buffer.splice(i, 1)[0]);
    return new Promise((resolve, reject) => {
      const t = setTimeout(
        () => reject(new Error(`${name}: timeout waiting for ${label}`)),
        timeoutMs,
      );
      waiters.push({
        match,
        resolve: (m) => {
          clearTimeout(t);
          resolve(m);
        },
      });
    });
  };
  return {
    name,
    send: (msg) => ws.send(JSON.stringify(msg)),
    next: (type) => waitFor((m) => m.type === type, type),
    nextWhere: (pred, label) => waitFor(pred, label),
    stateWhere: (pred, label, timeoutMs) =>
      waitFor((m) => m.type === 'room:state' && pred(m.snapshot), `state: ${label}`, timeoutMs),
    open: () => new Promise((r) => ws.once('open', r)),
    close: () => ws.close(),
  };
}

const settings = {
  chipsPerRound: 2,
  maxRolls: 3,
  maxPlayers: 3,
  minBuyIn: 10,
  maxBuyIn: 1000,
  straightPayout: { enabled: false, amountPerPlayer: 5 },
  classicPot: { enabled: false, donationAmount: 1 },
  yahtzeeBonus: { enabled: false, amountPerPlayer: 10 },
};

// One physics roll (ADR 004): throwStart locks keeps, throwResult reports the faces.
async function throwDice(me, myId, keepIndices, dice) {
  me.send({ type: 'turn:throwStart', keepIndices });
  await me.nextWhere(
    (m) => m.type === 'turn:throwStarted' && m.playerId === myId,
    `${me.name} throwStarted`,
  );
  me.send({ type: 'turn:throwResult', dice });
  return me.nextWhere(
    (m) => m.type === 'turn:rolled' && m.playerId === myId,
    `${me.name} turn:rolled`,
  );
}

let server = await startServer();
try {
  // -- before the crash: half a round -----------------------------------------
  let host = client('host');
  let ann = client('ann');
  await Promise.all([host.open(), ann.open()]);

  host.send({ type: 'room:create', playerName: 'Host', settings });
  const created = await host.next('room:created');
  ann.send({ type: 'room:join', roomId: created.roomId, playerName: 'Ann' });
  const annJoined = await ann.next('room:joined');

  host.send({ type: 'seat:request', buyIn: 100 });
  ann.send({ type: 'seat:request', buyIn: 100 });
  const req = await host.next('seat:requested');
  host.send({ type: 'seat:approve', playerId: req.playerId });
  await ann.stateWhere((s) => s.players.filter((p) => p.seat !== null).length === 2, 'both seated');

  host.send({ type: 'game:start' });
  let state = await host.stateWhere(
    (s) => s.phase === 'playing' && s.game?.currentTurn != null,
    'game started',
  );
  const firstTurn = state.snapshot.game.currentTurn.playerId;
  const byId = (id) => (id === created.playerId ? host : ann);

  // First player rolls twice and stands; second player rolls once → crash point.
  // Scripted faces: first ends with a pair of 2s; second's pair of 3s beats it
  // (so the post-recovery voluntary stand is legal against the roll-to-beat).
  const first = byId(firstTurn);
  await throwDice(first, firstTurn, [], [2, 2, 3, 4, 6]);
  await throwDice(first, firstTurn, [0, 1], [2, 2, 5, 4, 6]);
  first.send({ type: 'turn:stand' });
  state = await host.stateWhere(
    (s) => s.game?.currentTurn != null && s.game.currentTurn.playerId !== firstTurn,
    'second turn',
  );
  const secondTurn = state.snapshot.game.currentTurn.playerId;
  const second = byId(secondTurn);
  const midRoll = await throwDice(second, secondTurn, [], [3, 3, 2, 4, 6]);
  state = await host.stateWhere((s) => s.game?.currentTurn?.rollsUsed === 1, 'mid-turn state');
  const before = state.snapshot;

  // Give the in-order write queue a beat to land, then SIGKILL.
  await new Promise((r) => setTimeout(r, 300));
  server.kill('SIGKILL');
  await new Promise((r) => server.on('exit', r));
  host.close();
  ann.close();
  console.log('ok: server killed with SIGKILL mid-round');

  // -- after the restart: rejoin with tokens ----------------------------------
  server = await startServer();
  host = client('host2');
  ann = client('ann2');
  await Promise.all([host.open(), ann.open()]);

  host.send({
    type: 'room:join',
    roomId: created.roomId,
    playerName: 'Host',
    rejoinToken: created.rejoinToken,
  });
  const hostBack = await host.next('room:joined');
  assert(hostBack.playerId === created.playerId, 'host identity reclaimed via rejoinToken');

  ann.send({
    type: 'room:join',
    roomId: created.roomId,
    playerName: 'Ann',
    rejoinToken: annJoined.rejoinToken,
  });
  const annBack = await ann.next('room:joined');
  assert(annBack.playerId === annJoined.playerId, 'ann identity reclaimed via rejoinToken');

  const s = annBack.snapshot;
  assert(s.settings.chipsPerRound === 2, 'settings survived');
  assert(s.game?.pot === before.game.pot, `pot survived (${s.game?.pot})`);
  assert(
    s.players.every((p) => {
      const old = before.players.find((q) => q.id === p.id);
      return old && old.chips === p.chips && old.seat === p.seat;
    }),
    'chips and seats survived',
  );
  assert(s.game?.currentTurn?.playerId === secondTurn, 'mid-round turn survived');
  assert(
    JSON.stringify(s.game?.currentTurn?.dice) === JSON.stringify(midRoll.dice),
    'mid-turn dice survived',
  );
  assert(s.game?.rollToBeat != null, 'roll-to-beat survived');

  // Play can continue: the interrupted player stands, the round resolves.
  const secondAfter = secondTurn === created.playerId ? host : ann;
  secondAfter.send({ type: 'turn:stand' });
  const ended = await host.next('round:ended');
  assert(ended.potWon >= before.game.pot, `round resolved, pot paid out (${ended.potWon})`);
  const totals = (await host.stateWhere((s2) => s2.phase !== 'playing' || true, 'final state'))
    .snapshot;
  const totalChips =
    totals.players.reduce((sum, p) => sum + p.chips, 0) +
    (totals.game?.pot ?? 0) +
    (totals.game?.classicPot ?? 0);
  assert(totalChips === 200, `chips conserved after recovery (${totalChips})`);

  host.close();
  ann.close();
} finally {
  server.kill('SIGKILL');
  rmSync(logDir, { recursive: true, force: true });
}

if (failures > 0) {
  console.error(`${failures} assertion(s) failed`);
  process.exit(1);
}
console.log('recovery smoke test passed');
process.exit(0);
