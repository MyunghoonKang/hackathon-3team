// Drizzle ORM schema · sqlite
// 공동 계약 (H+0~2) · 소유권 경계:
//   - sessions     : 3A 소유 · 수정 금지 (4A)
//   - submissions  : 4A 소유
//   - credentials  : 4A 소유
// 마이그레이션 번호는 순차. 최초는 drizzle/0001_init.sql (3 테이블 한 번에).

import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import type { RoomStatus, WorkerStep } from '../../shared/protocol';

// ---------------------------------------------------------------------------
// sessions (3A · SessionManager 가 영속화)
//
// 이전 run 버그: SessionManager.persist?: boolean 옵션만 선언하고 DB insert 가
// 누락되어 submissions.sessionId FK 가 터졌다. 공동 계약 시점에 박아두는 규칙:
//   - SessionManager.create() 는 기본 persist=true. DB insert 반드시 수행.
//   - submissionHook → 4A enqueue 전에 sessions row 존재 여부를 재확인
//     (upsert-on-first-write 대신 Plan A 쪽에서 보장).
// ---------------------------------------------------------------------------

export const sessions = sqliteTable('sessions', {
  id: text('id').primaryKey(), // uuid
  roomCode: text('room_code').notNull().unique(), // 32^4 alphabet (A4)
  status: text('status').$type<RoomStatus>().notNull().default('PREPARING'),
  hostId: text('host_id').notNull(),
  gameId: text('game_id'), // null 인 동안은 LobbyView 의 GameSelector 대기
  loserId: text('loser_id'), // FINISHED 이후 세팅
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
});

// ---------------------------------------------------------------------------
// submissions (4A · SubmissionQueue + Scheduler 대상)
// sessionId FK: sessions.id 참조. 3A 가 sessions row 생성 보장한 뒤 insert.
// ---------------------------------------------------------------------------

export const submissions = sqliteTable('submissions', {
  id: text('id').primaryKey(), // uuid
  sessionId: text('session_id')
    .notNull()
    .references(() => sessions.id),
  status: text('status').$type<RoomStatus>().notNull().default('QUEUED'),
  workerStep: text('worker_step').$type<WorkerStep>(), // RUNNING 중에만 세팅
  scheduledAt: integer('scheduled_at', { mode: 'timestamp' }).notNull(), // 다음 영업일 09:00 KST
  erpRefNo: text('erp_ref_no'), // COMPLETED 에서 세팅
  errorLog: text('error_log'), // FAILED 에서 세팅
  attempts: integer('attempts').notNull().default(0),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
});

// ---------------------------------------------------------------------------
// credentials (4A · CredentialVault)
// 평문 저장 절대 금지. AES-256-GCM 암호화 후 ciphertext + iv + authTag 만 보관.
// sessionId 에 대해 1:1 (UNIQUE). 데모 종료 후 삭제 루틴은 B14 사후 정리 참조.
// ---------------------------------------------------------------------------

export const credentials = sqliteTable('credentials', {
  id: text('id').primaryKey(), // uuid
  sessionId: text('session_id')
    .notNull()
    .unique()
    .references(() => sessions.id),
  userId: text('user_id').notNull(), // 사번 (평문 OK — 민감정보 아님)
  loginIdCipher: text('login_id_cipher').notNull(), // base64
  passwordCipher: text('password_cipher').notNull(), // base64
  iv: text('iv').notNull(), // base64
  authTag: text('auth_tag').notNull(), // base64
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
});
