import express, { type Express } from 'express';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { createDb } from './db/client';
import * as schema from './db/schema';
import { CredentialVault } from './vault/vault';
import { credentialsRouter } from './routes/credentials';

export interface BuildAppOptions {
  vaultKey: Buffer;
  inMemory?: boolean;
  dbPath?: string;
  db?: BetterSQLite3Database<typeof schema>;
}

export interface BuiltApp {
  app: Express;
  db: BetterSQLite3Database<typeof schema>;
  vault: CredentialVault;
}

export function buildApp(opts: BuildAppOptions): BuiltApp {
  const db =
    opts.db ?? createDb(opts.inMemory ? ':memory:' : (opts.dbPath ?? 'data/sqlite.db'));
  const vault = new CredentialVault(db, opts.vaultKey);

  const app = express();
  app.use(express.json());

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, ts: new Date().toISOString() });
  });

  app.use('/api/credentials', credentialsRouter(vault));

  return { app, db, vault };
}
