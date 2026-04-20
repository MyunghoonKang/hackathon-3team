-- 0001_init.sql · sessions + submissions + credentials (공동 계약 H+0~2)
-- 이후 4A 가 필요 시 0002_*.sql 로 append. rename · drop 은 금지.

CREATE TABLE IF NOT EXISTS sessions (
  id            TEXT PRIMARY KEY,
  room_code     TEXT NOT NULL UNIQUE,
  status        TEXT NOT NULL DEFAULT 'PREPARING',
  host_id       TEXT NOT NULL,
  game_id       TEXT,
  loser_id      TEXT,
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sessions_room_code ON sessions(room_code);
CREATE INDEX IF NOT EXISTS idx_sessions_status    ON sessions(status);

CREATE TABLE IF NOT EXISTS submissions (
  id            TEXT PRIMARY KEY,
  session_id    TEXT NOT NULL REFERENCES sessions(id),
  status        TEXT NOT NULL DEFAULT 'QUEUED',
  worker_step   TEXT,
  scheduled_at  INTEGER NOT NULL,
  erp_ref_no    TEXT,
  error_log     TEXT,
  attempts      INTEGER NOT NULL DEFAULT 0,
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_submissions_session_id  ON submissions(session_id);
CREATE INDEX IF NOT EXISTS idx_submissions_status      ON submissions(status);
CREATE INDEX IF NOT EXISTS idx_submissions_scheduled_at ON submissions(scheduled_at);

CREATE TABLE IF NOT EXISTS credentials (
  id                TEXT PRIMARY KEY,
  session_id        TEXT NOT NULL UNIQUE REFERENCES sessions(id),
  user_id           TEXT NOT NULL,
  login_id_cipher   TEXT NOT NULL,
  password_cipher   TEXT NOT NULL,
  iv                TEXT NOT NULL,
  auth_tag          TEXT NOT NULL,
  created_at        INTEGER NOT NULL
);
