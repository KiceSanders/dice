import { startServer } from './startServer.js';

const server = await startServer();
console.log(`[server] listening on port ${server.port}`);

let shuttingDown = false;
const shutdown = () => {
  if (shuttingDown) return;
  shuttingDown = true;
  void server
    .close()
    .catch((error) => {
      console.error('[server] shutdown error:', error);
    })
    .finally(() => process.exit(0));
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
