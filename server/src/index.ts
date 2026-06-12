import express from 'express';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { ConnectionRegistry } from './connection.js';
import { createHandlers, handleDisconnect } from './handlers.js';
import { recoverRooms, RoomLogStore } from './persistence.js';
import { RoomManager } from './roomManager.js';
import { Router } from './router.js';

const PORT = Number(process.env.PORT ?? 3001);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOG_DIR = process.env.LOG_DIR ?? path.resolve(__dirname, '../logs');

const app = express();
const registry = new ConnectionRegistry();
const store = new RoomLogStore(LOG_DIR);
const rooms = new RoomManager(undefined, undefined, store);
const router = new Router(createHandlers(rooms));

const recovered = await recoverRooms(store, rooms);
if (recovered > 0) console.log(`[server] recovered ${recovered} room(s) from event logs`);

app.get('/health', (_req, res) => {
  res.json({ ok: true, rooms: rooms.size, connections: registry.size });
});

if (process.env.NODE_ENV === 'production') {
  const clientDist = path.resolve(__dirname, '../../client/dist');
  app.use(express.static(clientDist));
  // SPA fallback
  app.use((_req, res) => res.sendFile(path.join(clientDist, 'index.html')));
}

const httpServer = createServer(app);
const wss = new WebSocketServer({ server: httpServer });

wss.on('connection', (socket) => {
  const conn = registry.add(socket);
  socket.on('message', (raw) => router.dispatch(conn, String(raw)));
  socket.on('close', () => handleDisconnect(rooms, conn));
  socket.on('error', (err) => console.error(`[ws] socket error (${conn.id}):`, err.message));
});

registry.startHeartbeat();
rooms.startReaper();

httpServer.listen(PORT, () => {
  console.log(`[server] listening on http://localhost:${PORT}`);
});

process.on('SIGTERM', () => {
  registry.stop();
  rooms.stop();
  void store.flush().finally(() => httpServer.close(() => process.exit(0)));
});
