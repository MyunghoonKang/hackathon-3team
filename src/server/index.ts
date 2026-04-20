import { createServer } from 'node:http';
import { Server as IOServer } from 'socket.io';
import { buildApp } from './app';
import { loadConfig } from './config';
import { SubmissionQueue } from './submissions/queue';
import { Scheduler } from './submissions/scheduler';

const config = loadConfig();
const { app, db } = buildApp({ vaultKey: config.vaultKey, dbPath: config.dbPath });

const httpServer = createServer(app);
new IOServer(httpServer, {
  cors: { origin: 'http://localhost:5173' },
});

const queue = new SubmissionQueue(db);

// 4B 가 src/server/worker/index.ts 에서 runSubmission 을 export 하면 실 워커가 붙는다.
// 부재 시에는 no-op 으로 대체해 Scheduler 만 먼저 돌려두고, 워커 머지 후 재기동한다.
async function resolveRunSubmission(): Promise<(id: string) => Promise<void>> {
  // 동적 경로로 import 해 TS 가 아직 없는 모듈을 컴파일 타임에 해결하지 않도록 한다.
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
const scheduler = new Scheduler({ queue, runSubmission, logger: console });
scheduler.start();

httpServer.listen(config.port, () => {
  console.log(`[server] listening on :${config.port}`);
});
