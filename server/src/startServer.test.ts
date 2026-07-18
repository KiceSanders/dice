import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { startServer } from './startServer.js';

function openSocket(url: string): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url);
    socket.once('open', () => resolve(socket));
    socket.once('error', reject);
  });
}

describe('startServer shutdown', () => {
  it('closes the HTTP server even when flushing logs fails', async () => {
    const logDir = await mkdtemp(path.join(tmpdir(), 'dice-close-test-'));
    const server = await startServer({ port: 0, host: '127.0.0.1', logDir, recover: false });
    const originalClose = server.httpServer.close.bind(server.httpServer);
    let closeCalled = false;

    server.store.flush = async () => {
      throw new Error('flush failed');
    };
    server.httpServer.close = ((callback?: Parameters<typeof server.httpServer.close>[0]) => {
      closeCalled = true;
      return originalClose(callback);
    }) as typeof server.httpServer.close;

    await expect(server.close()).rejects.toThrow('flush failed');
    expect(closeCalled).toBe(true);
  });

  it('serves a hardened health check and accepts WebSockets only on /ws', async () => {
    const logDir = await mkdtemp(path.join(tmpdir(), 'dice-http-test-'));
    const server = await startServer({ port: 0, host: '127.0.0.1', logDir, recover: false });

    try {
      const response = await fetch(`http://127.0.0.1:${server.port}/health`);
      expect(await response.json()).toEqual({ ok: true });
      expect(response.headers.get('cache-control')).toBe('no-store');
      expect(response.headers.get('x-content-type-options')).toBe('nosniff');
      expect(response.headers.get('x-powered-by')).toBeNull();

      const socket = await openSocket(`ws://127.0.0.1:${server.port}/ws`);
      socket.close();

      await expect(openSocket(`ws://127.0.0.1:${server.port}/`)).rejects.toThrow();
    } finally {
      await server.close();
    }
  });
});
