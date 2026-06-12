import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import type { WebSocket } from 'ws';
import { Connection, ConnectionRegistry } from './connection.js';
import { Router } from './router.js';

/** Minimal stand-in for a ws socket. */
class FakeSocket extends EventEmitter {
  OPEN = 1;
  readyState = 1;
  sent: string[] = [];
  pinged = 0;
  terminated = false;

  send(data: string) {
    this.sent.push(data);
  }
  ping() {
    this.pinged++;
  }
  terminate() {
    this.terminated = true;
    this.emit('close');
  }
  close() {
    this.emit('close');
  }

  lastMessage(): unknown {
    const last = this.sent[this.sent.length - 1];
    return last === undefined ? undefined : JSON.parse(last);
  }
}

const asWs = (s: FakeSocket) => s as unknown as WebSocket;

describe('Connection', () => {
  it('sends typed messages as JSON', () => {
    const socket = new FakeSocket();
    const conn = new Connection(asWs(socket));
    conn.send({ type: 'error', code: 'BAD_REQUEST', message: 'nope' });
    expect(socket.lastMessage()).toEqual({ type: 'error', code: 'BAD_REQUEST', message: 'nope' });
  });

  it('does not send on a closed socket', () => {
    const socket = new FakeSocket();
    socket.readyState = 3; // CLOSED
    const conn = new Connection(asWs(socket));
    conn.send({ type: 'error', code: 'INTERNAL', message: 'x' });
    expect(socket.sent).toHaveLength(0);
  });

  it('survives heartbeats while the client answers pings', () => {
    const socket = new FakeSocket();
    const conn = new Connection(asWs(socket));

    expect(conn.checkHeartbeat()).toBe(true); // ping sent
    socket.emit('pong');
    expect(conn.checkHeartbeat()).toBe(true);
    expect(socket.pinged).toBe(2);
    expect(socket.terminated).toBe(false);
  });

  it('terminates a dead socket on the second unanswered sweep', () => {
    const socket = new FakeSocket();
    const conn = new Connection(asWs(socket));

    expect(conn.checkHeartbeat()).toBe(true); // ping 1, no pong
    expect(conn.checkHeartbeat()).toBe(false); // dead
    expect(socket.terminated).toBe(true);
  });
});

describe('ConnectionRegistry', () => {
  it('removes dead sockets within two sweeps (≤60s at 30s interval)', () => {
    vi.useFakeTimers();
    const registry = new ConnectionRegistry();
    const live = new FakeSocket();
    const dead = new FakeSocket();
    registry.add(asWs(live));
    registry.add(asWs(dead));
    registry.startHeartbeat(30_000);

    // Sweep 1: both pinged; only `live` answers.
    vi.advanceTimersByTime(30_000);
    live.emit('pong');
    // Sweep 2: `dead` never answered → terminated and removed.
    vi.advanceTimersByTime(30_000);

    expect(dead.terminated).toBe(true);
    expect(live.terminated).toBe(false);
    expect(registry.size).toBe(1);

    registry.stop();
    vi.useRealTimers();
  });
});

describe('Router', () => {
  it('replies with a per-type handler result', () => {
    const socket = new FakeSocket();
    const conn = new Connection(asWs(socket));
    const handled = vi.fn();
    const router = new Router({ 'game:start': handled });

    router.dispatch(conn, JSON.stringify({ type: 'game:start' }));
    expect(handled).toHaveBeenCalledOnce();
  });

  it('replies BAD_REQUEST on invalid messages', () => {
    const socket = new FakeSocket();
    const conn = new Connection(asWs(socket));
    const router = new Router({});

    router.dispatch(conn, 'not json');
    expect(socket.lastMessage()).toMatchObject({ type: 'error', code: 'BAD_REQUEST' });
  });

  it('catches throwing handlers and replies INTERNAL without crashing', () => {
    const socket = new FakeSocket();
    const conn = new Connection(asWs(socket));
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const router = new Router({
      'turn:stand': () => {
        throw new Error('boom');
      },
    });

    expect(() => router.dispatch(conn, JSON.stringify({ type: 'turn:stand' }))).not.toThrow();
    expect(socket.lastMessage()).toMatchObject({ type: 'error', code: 'INTERNAL' });
    errSpy.mockRestore();
  });

  it('replies BAD_REQUEST for valid types with no registered handler', () => {
    const socket = new FakeSocket();
    const conn = new Connection(asWs(socket));
    const router = new Router({});

    router.dispatch(conn, JSON.stringify({ type: 'turn:stand' }));
    expect(socket.lastMessage()).toMatchObject({ type: 'error', code: 'BAD_REQUEST' });
  });
});
