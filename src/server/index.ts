import { createServer } from 'node:http';
import type { Express } from 'express';
import { Server as IOServer } from 'socket.io';
import { buildApp } from './app';
import { loadConfig } from './config';
import { Scheduler } from './submissions/scheduler';
import { GameRegistry } from './games/registry';
import { attachIo } from './io';
import { sessionsRouter } from './routes/sessions';
import { runSubmission, setWorkerDeps } from './worker/index';

const config = loadConfig();

const registry = new GameRegistry({ dir: config.gamesDir, watch: true });
await registry.scan();
registry.startWatching();

// app을 나중에 할당하되, createServer 클로저로 참조 — engine.io가 non-socket.io 요청을 app으로 위임
let app: Express;
const httpServer = createServer((req, res) => app(req, res));
const io = new IOServer(httpServer, {
  cors: { origin: /^http:\/\/localhost:\d+$/ },
});

const runSubmissionVoid = async (id: string): Promise<void> => {
  await runSubmission(id);
};

const built = buildApp({
  vaultKey: config.vaultKey,
  dbPath: config.dbPath,
  io,
  workerMode: config.workerMode,
  runSubmission: runSubmissionVoid,
  registry,
  gamesDir: config.gamesDir,
});

setWorkerDeps({
  db: built.db,
  queue: built.queue,
  mgr: built.mgr,
  io,
  vault: built.vault,
  mode: config.workerMode,
  env: process.env,
  erpBaseUrl: config.erpBaseUrl,
  erpCompanyCode: config.erpCompanyCode,
  headless: false,
});

app = built.app;
app.use('/api/sessions', sessionsRouter(built.mgr));

if (built.registry) {
  attachIo(io, { mgr: built.mgr, registry: built.registry });
}

const scheduler = new Scheduler({ queue: built.queue, runSubmission: runSubmissionVoid, logger: console });
scheduler.start();

httpServer.listen(config.port, () => {
  console.log(`[server] listening on :${config.port} (worker mode=${config.workerMode})`);
});
