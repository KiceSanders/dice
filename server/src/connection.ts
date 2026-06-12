import { randomUUID } from 'node:crypto';
import type { WebSocket } from 'ws';
import type { PlayerId, RoomId, ServerMessage } from '@dice/shared';

export const HEARTBEAT_INTERVAL_MS = 30_000;

/**
 * Wraps a raw ws socket with typed send, heartbeat liveness tracking,
 * and the player/room binding established once the client joins a room.
 */
export class Connection {
  readonly id = randomUUID();
  playerId: PlayerId | null = null;
  roomId: RoomId | null = null;
  private alive = true;

  constructor(private readonly socket: WebSocket) {
    socket.on('pong', () => {
      this.alive = true;
    });
  }

  send(msg: ServerMessage): void {
    if (this.socket.readyState === this.socket.OPEN) {
      this.socket.send(JSON.stringify(msg));
    }
  }

  sendError(code: Extract<ServerMessage, { type: 'error' }>['code'], message: string): void {
    this.send({ type: 'error', code, message });
  }

  /** Returns false (and terminates the socket) if the last ping went unanswered. */
  checkHeartbeat(): boolean {
    if (!this.alive) {
      this.socket.terminate();
      return false;
    }
    this.alive = false;
    this.socket.ping();
    return true;
  }

  close(): void {
    this.socket.close();
  }
}

/** Registry of live connections with the shared heartbeat sweep. */
export class ConnectionRegistry {
  private readonly connections = new Set<Connection>();
  private timer: NodeJS.Timeout | null = null;

  add(socket: WebSocket): Connection {
    const conn = new Connection(socket);
    this.connections.add(conn);
    socket.on('close', () => this.connections.delete(conn));
    return conn;
  }

  get size(): number {
    return this.connections.size;
  }

  startHeartbeat(intervalMs = HEARTBEAT_INTERVAL_MS): void {
    this.timer = setInterval(() => {
      for (const conn of this.connections) {
        if (!conn.checkHeartbeat()) this.connections.delete(conn);
      }
    }, intervalMs);
    this.timer.unref();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    for (const conn of this.connections) conn.close();
    this.connections.clear();
  }
}
