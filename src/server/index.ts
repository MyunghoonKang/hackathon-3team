import { createServer } from 'node:http';
import { Server as IOServer } from 'socket.io';
import { buildApp } from './app';
import { loadConfig } from './config';
import { Scheduler } from './submissions/scheduler';

const config = loadConfig();

// 4B 가 src/server/worker/index.ts 에서 runSubmission 을 export 하면 실 워커가 붙는다.
// 부재 시에는 no-op 으로 대체해 Scheduler/run-now 만 먼저 돌려두고, 워커 머지 후 재기동한다.
async function resolveRunSubmission(): Promise<(id: string) => Promise<void>> {
  const workerPath = './worker/index.js';
  try {
    const mod = (await import(workerPath)) as {
      runSubmission?: (id: string) => Promise<unknown>;
    };
    if (typeof mod.runSubmission === 'function') {
      return async (id) => {
        await mod.runSubmission!(id);
      };
    }
    console.warn('[scheduler] ./worker/index.ts has no runSubmission export — using no-op');
  } catch {
    console.warn('[scheduler] worker module not yet available — using no-op');
  }
  return async () => {};
}

const runSubmission = await resolveRunSubmission();

const httpServer = createServer();
const io = new IOServer(httpServer, {
  cors: { origin: 'http://localhost:5173' },
});

const { app, queue } = buildApp({
  vaultKey: config.vaultKey,
  dbPath: config.dbPath,
  io,
  workerMode: config.workerMode,
  runSubmission,
});

httpServer.on('request', app);

const scheduler = new Scheduler({ queue, runSubmission, logger: console });
scheduler.start();

httpServer.listen(config.port, () => {
  console.log(`[server] listening on :${config.port}`);
});
