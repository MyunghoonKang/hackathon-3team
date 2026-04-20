import { existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';

// 간이 마이그레이터 — drizzle/*.sql 을 파일명 순서로 실행하고
// `__migrations` 테이블에 체크인된 파일은 건너뛴다.
// drizzle-kit push 대신 24h 해커톤 현실에 맞춘 최소 구현.

const dbPath = process.env.DB_PATH ?? 'data/sqlite.db';
const drizzleDir = path.resolve(process.cwd(), 'drizzle');

const dbDir = path.dirname(path.resolve(dbPath));
if (!existsSync(dbDir)) mkdirSync(dbDir, { recursive: true });

const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS __migrations (
    name TEXT PRIMARY KEY,
    applied_at INTEGER NOT NULL
  )
`);

const applied = new Set(
  db.prepare<[], { name: string }>('SELECT name FROM __migrations').all().map((r) => r.name),
);

const files = readdirSync(drizzleDir)
  .filter((f) => f.endsWith('.sql'))
  .sort();

let appliedCount = 0;
for (const file of files) {
  if (applied.has(file)) continue;
  const sql = readFileSync(path.join(drizzleDir, file), 'utf8');
  const tx = db.transaction(() => {
    db.exec(sql);
    db.prepare('INSERT INTO __migrations (name, applied_at) VALUES (?, ?)').run(file, Date.now());
  });
  tx();
  console.log(`[migrate] applied ${file}`);
  appliedCount += 1;
}

if (appliedCount === 0) {
  console.log('[migrate] nothing to apply');
}

db.close();
