import { createServer, type Server as HttpServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { WebSocketServer } from 'ws';
import { ConnectionRegistry } from './connection.js';
import { createHandlers, handleDisconnect } from './handlers.js';
import { RoomLogStore, recoverRooms } from './persistence.js';
import { RoomManager } from './roomManager.js';
import { Router } from './router.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export interface StartedServer {
  port: number;
  httpServer: HttpServer;
  rooms: RoomManager;
  store: RoomLogStore;
  registry: ConnectionRegistry;
  close: () => Promise<void>;
}

export interface StartServerOptions {
  port?: number;
  logDir?: string;
  recover?: boolean;
}

/**
 * Boot the HTTP + WebSocket stack. Used by `index.ts` and the integration harness.
 */
export async function startServer(opts: StartServerOptions = {}): Promise<StartedServer> {
  const port = opts.port ?? Number(process.env.PORT ?? 3001);
  const logDir = opts.logDir ?? process.env.LOG_DIR ?? path.resolve(__dirname, '../logs');

  const app = express();
  const registry = new ConnectionRegistry();
  const store = new RoomLogStore(logDir);
  const rooms = new RoomManager(undefined, undefined, store);
  const router = new Router(createHandlers(rooms));

  if (opts.recover !== false) {
    const recovered = await recoverRooms(store, rooms);
    if (recovered > 0) console.log(`[server] recovered ${recovered} room(s) from event logs`);
  }

  app.get('/health', (_req, res) => {
    res.json({ ok: true, rooms: rooms.size, connections: registry.size });
  });

  if (process.env.NODE_ENV === 'production') {
    const clientDist = path.resolve(__dirname, '../../client/dist');
    app.use(express.static(clientDist));
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

  await new Promise<void>((resolve, reject) => {
    const onError = (error: Error) => {
      httpServer.off('listening', onListening);
      reject(error);
    };
    const onListening = () => {
      httpServer.off('error', onError);
      resolve();
    };
    httpServer.once('error', onError);
    httpServer.listen(port, onListening);
  });

  const address = httpServer.address();
  const boundPort = typeof address === 'object' && address ? address.port : port;

  return {
    port: boundPort,
    httpServer,
    rooms,
    store,
    registry,
    close: async () => {
      registry.stop();
      rooms.stop();
      try {
        await store.flush();
      } finally {
        await new Promise<void>((resolve, reject) => {
          httpServer.close((err) => (err ? reject(err) : resolve()));
        });
      }
    },
  };
}
