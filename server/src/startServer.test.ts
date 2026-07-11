import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { startServer } from './startServer.js';

describe('startServer shutdown', () => {
  it('closes the HTTP server even when flushing logs fails', async () => {
    const logDir = await mkdtemp(path.join(tmpdir(), 'dice3-close-test-'));
    const server = await startServer({ port: 0, logDir, recover: false });
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
});
