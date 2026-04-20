import express, { type Express } from 'express';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type { Server as IOServer } from 'socket.io';
import { createDb } from './db/client';
import * as schema from './db/schema';
import { CredentialVault } from './vault/vault';
import { credentialsRouter } from './routes/credentials';
import { submissionsRouter } from './routes/submissions';
import { SubmissionQueue } from './submissions/queue';
import { SessionManager } from './session/manager';
import {
  createSubmissionHook,
  registerSubmissionHook,
  type SubmissionHook,
} from './hooks/submissionHook';
import type { WorkerMode } from './config';

export interface BuildAppOptions {
  vaultKey: Buffer;
  inMemory?: boolean;
  dbPath?: string;
  db?: BetterSQLite3Database<typeof schema>;
  io?: IOServer | null;
  workerMode?: WorkerMode;
  runSubmission?: (id: string) => Promise<unknown>;
  now?: () => Date;
}

export interface BuiltApp {
  app: Express;
  db: BetterSQLite3Database<typeof schema>;
  vault: CredentialVault;
  queue: SubmissionQueue;
  mgr: SessionManager;
  submissionHook: SubmissionHook;
}

export function buildApp(opts: BuildAppOptions): BuiltApp {
  const db =
    opts.db ?? createDb(opts.inMemory ? ':memory:' : (opts.dbPath ?? 'data/sqlite.db'));
  const vault = new CredentialVault(db, opts.vaultKey);
  const queue = new SubmissionQueue(db);
  const mgr = new SessionManager(db);

  const app = express();
  app.use(express.json());

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, ts: new Date().toISOString() });
  });

  app.use('/api/credentials', credentialsRouter(vault));

  app.use(
    '/api',
    submissionsRouter({
      db,
      mgr,
      queue,
      io: opts.io ?? null,
      workerMode: opts.workerMode ?? 'mock',
      runSubmission: opts.runSubmission ?? (async () => {}),
      now: opts.now,
    }),
  );

  // B12: 모듈 레벨 onGameFinished 가 mgr/io 를 잡도록 1회 바인딩.
  // 3A GameRunner 가 import 한 onGameFinished 는 이 시점부터 실 전이 수행.
  const hookDeps = { mgr, io: opts.io ?? null };
  const submissionHook = createSubmissionHook(hookDeps);
  registerSubmissionHook(hookDeps);

  return { app, db, vault, queue, mgr, submissionHook };
}
