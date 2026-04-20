import { createServer } from 'node:http';
import { Server as IOServer } from 'socket.io';
import { buildApp } from './app';
import { loadConfig } from './config';
import { Scheduler } from './submissions/scheduler';
import { GameRegistry } from './games/registry';
import { attachIo } from './io';
import { sessionsRouter } from './routes/sessions';
import { runSubmission, setWorkerDeps } from './worker/index';

const config = loadConfig();

const httpServer = createServer();
const io = new IOServer(httpServer, {
  cors: { origin: 'http://localhost:5173' },
});

// GameRegistry 생성 + 초기 스캔
const registry = new GameRegistry({ dir: config.gamesDir, watch: true });
await registry.scan();
registry.startWatching();

// Scheduler/router 가 보는 시그니처는 (id) => Promise<void>. 4B 의 runSubmission 은
// WorkerResult 를 돌려주지만 호출자는 무시(상태 갱신은 워커가 직접 책임). 타입만 맞춰 wrap.
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

// 4B 워커 deps 주입 — runSubmission 은 buildApp() 시점에 이미 router/scheduler 에
// 캡처되어 있지만 실제 실행은 deps 가 채워진 이후이므로 안전.
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

built.app.use('/api/sessions', sessionsRouter(built.mgr));

if (built.registry) {
  attachIo(io, { mgr: built.mgr, registry: built.registry });
}

httpServer.on('request', built.app);

const scheduler = new Scheduler({ queue: built.queue, runSubmission: runSubmissionVoid, logger: console });
scheduler.start();

httpServer.listen(config.port, () => {
  // eslint-disable-next-line no-console
  console.log(`[server] listening on :${config.port} (worker mode=${config.workerMode})`);
});
