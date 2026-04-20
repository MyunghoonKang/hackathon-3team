import { existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema';

// Shared db client factory. 테스트(:memory:) 와 서버 프로세스가 모두 사용.
// :memory: 를 넘기면 drizzle/*.sql 을 즉시 실행해 스키마를 올린다 — migrate.ts
// 에 의존하지 않는 테스트 경로를 위한 편의.
export function createDb(dbPath: string): BetterSQLite3Database<typeof schema> {
  const isMemory = dbPath === ':memory:';
  if (!isMemory) {
    const dir = path.dirname(path.resolve(dbPath));
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  }

  const sqlite = new Database(dbPath);
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');

  if (isMemory) applyMigrationsInline(sqlite);

  return drizzle(sqlite, { schema });
}

function applyMigrationsInline(sqlite: Database.Database): void {
  const drizzleDir = path.resolve(process.cwd(), 'drizzle');
  if (!existsSync(drizzleDir)) return;
  const files = readdirSync(drizzleDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();
  for (const file of files) {
    const sql = readFileSync(path.join(drizzleDir, file), 'utf8');
    sqlite.exec(sql);
  }
}
