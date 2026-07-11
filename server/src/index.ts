import { startServer } from './startServer.js';

const server = await startServer();
console.log(`[server] listening on http://localhost:${server.port}`);

process.on('SIGTERM', () => {
  void server
    .close()
    .catch((error) => {
      console.error('[server] shutdown error:', error);
    })
    .finally(() => process.exit(0));
});
