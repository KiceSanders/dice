// Phase 2 smoke test: connect → bad messages → structured error replies.
// Usage: node scripts/smoke-ws.mjs (server must be running on :3001)
import WebSocket from 'ws';

const url = process.env.WS_URL ?? 'ws://localhost:3001';
const ws = new WebSocket(url);

const reply = () =>
  new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timed out waiting for reply')), 3000);
    ws.once('message', (raw) => {
      clearTimeout(t);
      resolve(JSON.parse(String(raw)));
    });
  });

function assert(cond, label) {
  if (!cond) {
    console.error(`FAIL: ${label}`);
    process.exit(1);
  }
  console.log(`ok: ${label}`);
}

ws.on('open', async () => {
  console.log(`connected to ${url}`);

  ws.send('{not json');
  let msg = await reply();
  assert(msg.type === 'error' && msg.code === 'BAD_REQUEST', `malformed JSON → ${msg.message}`);

  ws.send(JSON.stringify({ type: 'no:such:type' }));
  msg = await reply();
  assert(msg.type === 'error' && msg.code === 'BAD_REQUEST', `unknown type → ${msg.message}`);

  ws.send(JSON.stringify({ type: 'room:create', playerName: 'x' }));
  msg = await reply();
  assert(msg.type === 'error' && msg.code === 'BAD_REQUEST', `missing fields → ${msg.message}`);

  ws.send(JSON.stringify({ type: 'game:start' }));
  msg = await reply();
  assert(
    msg.type === 'error' && /no handler/.test(msg.message),
    `valid-but-unwired type → ${msg.message}`,
  );

  console.log('smoke test passed');
  ws.close();
  process.exit(0);
});

ws.on('error', (err) => {
  console.error('connection failed:', err.message);
  process.exit(1);
});
