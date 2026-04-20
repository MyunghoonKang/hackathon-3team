import { createServer } from 'node:http';
import { Server as IOServer } from 'socket.io';
import { buildApp } from './app';
import { loadConfig } from './config';

const config = loadConfig();
const { app } = buildApp({ vaultKey: config.vaultKey, dbPath: config.dbPath });

const httpServer = createServer(app);
new IOServer(httpServer, {
  cors: { origin: 'http://localhost:5173' },
});

httpServer.listen(config.port, () => {
  console.log(`[server] listening on :${config.port}`);
});
