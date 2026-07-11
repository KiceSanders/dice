import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { ClientMessage, ServerMessage } from '@dice/shared';
import WebSocket from 'ws';
import { type StartedServer, startServer } from '../src/startServer.js';

/**
 * Integration harness (PLAN.md Phase 12.1): ephemeral server + FakeClient.
 */

export async function startTestServer(): Promise<StartedServer> {
  const logDir = await mkdtemp(path.join(tmpdir(), 'dice3-test-'));
  return startServer({ port: 0, logDir, recover: false });
}

type Waiter = {
  match: (msg: ServerMessage) => boolean;
  resolve: (msg: ServerMessage) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
};

export class FakeClient {
  private readonly buffer: ServerMessage[] = [];
  private readonly waiters: Waiter[] = [];
  private socket: WebSocket | null = null;

  constructor(readonly name: string) {}

  async connect(url: string): Promise<void> {
    this.socket = new WebSocket(url);
    this.socket.on('message', (raw) => {
      const msg = JSON.parse(String(raw)) as ServerMessage;
      const i = this.waiters.findIndex((w) => w.match(msg));
      if (i >= 0) {
        const waiter = this.waiters.splice(i, 1)[0]!;
        clearTimeout(waiter.timer);
        waiter.resolve(msg);
      } else {
        this.buffer.push(msg);
      }
    });
    await new Promise<void>((resolve, reject) => {
      this.socket!.once('open', () => resolve());
      this.socket!.once('error', reject);
    });
  }

  send(msg: ClientMessage): void {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      throw new Error(`${this.name}: socket not open`);
    }
    this.socket.send(JSON.stringify(msg));
  }

  next(type: ServerMessage['type'], timeoutMs = 5_000): Promise<ServerMessage> {
    return this.nextWhere((m) => m.type === type, type, timeoutMs);
  }

  nextWhere(
    match: (msg: ServerMessage) => boolean,
    label: string,
    timeoutMs = 5_000,
  ): Promise<ServerMessage> {
    const i = this.buffer.findIndex(match);
    if (i >= 0) return Promise.resolve(this.buffer.splice(i, 1)[0]!);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        const idx = this.waiters.indexOf(waiter);
        if (idx >= 0) this.waiters.splice(idx, 1);
        reject(new Error(`${this.name}: timeout waiting for ${label}`));
      }, timeoutMs);
      const waiter: Waiter = { match, resolve, reject, timer };
      this.waiters.push(waiter);
    });
  }

  close(): void {
    for (const w of this.waiters) {
      clearTimeout(w.timer);
      w.reject(new Error(`${this.name}: closed`));
    }
    this.waiters.length = 0;
    this.socket?.close();
    this.socket = null;
  }
}
