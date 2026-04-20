import { randomUUID } from 'node:crypto';
import { and, asc, eq, lte, sql } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import * as schema from '../db/schema';
import type {
  ClaimedSubmission,
  CompleteInput,
  EnqueueInput,
  FailInput,
  WorkerStep,
} from './types';

// SubmissionQueue · submissions 테이블 위 상태머신.
//
// 전이 그래프 (RoomStatus 와 공유 — protocol.ts ALLOWED_TRANSITIONS 의 부분집합):
//   QUEUED  → RUNNING   (claimNext)
//   RUNNING → COMPLETED (complete)
//   RUNNING → FAILED    (fail)
//   RUNNING → QUEUED    (recoverStuck — updatedAt 가 threshold 보다 오래된 stuck row)
//
// 동시성: SQLite 가 write 를 직렬화하므로 single-row 조건부 UPDATE
// (`WHERE id = ? AND status = 'QUEUED'`) 만으로 race 가 없다. WAL + busy
// retry 는 better-sqlite3 가 처리.
//
// 주의: 이 클래스는 RoomStatePayload 를 broadcast 하지 않는다. 호출자(Scheduler ·
// /run-now 라우트 · workerHook) 가 transition 직후 SessionManager.transitionStatus
// + broadcastRoomState 를 호출해 UI 갱신 책임을 진다.

export class SubmissionQueue {
  constructor(private db: BetterSQLite3Database<typeof schema>) {}

  enqueue(input: EnqueueInput): string {
    const id = randomUUID();
    const now = new Date();
    this.db
      .insert(schema.submissions)
      .values({
        id,
        sessionId: input.sessionId,
        status: 'QUEUED',
        scheduledAt: input.scheduledAt,
        attempts: 0,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    return id;
  }

  claimNext(now: Date): ClaimedSubmission | null {
    const candidate = this.db
      .select({ id: schema.submissions.id, attempts: schema.submissions.attempts })
      .from(schema.submissions)
      .where(
        and(eq(schema.submissions.status, 'QUEUED'), lte(schema.submissions.scheduledAt, now)),
      )
      .orderBy(asc(schema.submissions.scheduledAt), asc(schema.submissions.createdAt))
      .limit(1)
      .get();
    if (!candidate) return null;

    const nextAttempts = candidate.attempts + 1;
    const updated = this.db
      .update(schema.submissions)
      .set({
        status: 'RUNNING',
        attempts: nextAttempts,
        workerStep: null,
        errorLog: null,
        updatedAt: now,
      })
      .where(
        and(eq(schema.submissions.id, candidate.id), eq(schema.submissions.status, 'QUEUED')),
      )
      .returning({ id: schema.submissions.id })
      .all();
    if (updated.length === 0) return null; // 다른 워커가 먼저 채감
    return { id: candidate.id, status: 'RUNNING', attempts: nextAttempts };
  }

  complete(id: string, out: CompleteInput): void {
    this.db
      .update(schema.submissions)
      .set({
        status: 'COMPLETED',
        erpRefNo: out.erpRefNo ?? null,
        workerStep: null,
        errorLog: null,
        updatedAt: new Date(),
      })
      .where(and(eq(schema.submissions.id, id), eq(schema.submissions.status, 'RUNNING')))
      .run();
  }

  fail(id: string, f: FailInput): void {
    this.db
      .update(schema.submissions)
      .set({
        status: 'FAILED',
        errorLog: f.errorLog,
        workerStep: null,
        updatedAt: new Date(),
      })
      .where(and(eq(schema.submissions.id, id), eq(schema.submissions.status, 'RUNNING')))
      .run();
  }

  updateWorkerStep(id: string, step: WorkerStep): void {
    this.db
      .update(schema.submissions)
      .set({ workerStep: step, updatedAt: new Date() })
      .where(and(eq(schema.submissions.id, id), eq(schema.submissions.status, 'RUNNING')))
      .run();
  }

  recoverStuck({
    thresholdMs,
    now = new Date(),
  }: {
    thresholdMs: number;
    now?: Date;
  }): number {
    const cutoff = new Date(now.getTime() - thresholdMs);
    const reset = this.db
      .update(schema.submissions)
      .set({ status: 'QUEUED', workerStep: null, updatedAt: now })
      .where(and(eq(schema.submissions.status, 'RUNNING'), lte(schema.submissions.updatedAt, cutoff)))
      .returning({ id: schema.submissions.id })
      .all();
    return reset.length;
  }

  // run-now 전용: 특정 id 의 QUEUED row 를 직접 RUNNING 으로 전이.
  // claimNext 와 달리 scheduledAt 무관하게 해당 id 만 대상.
  claimById(id: string, now = new Date()): boolean {
    const row = this.db
      .select({ attempts: schema.submissions.attempts })
      .from(schema.submissions)
      .where(and(eq(schema.submissions.id, id), eq(schema.submissions.status, 'QUEUED')))
      .get();
    if (!row) return false;
    const updated = this.db
      .update(schema.submissions)
      .set({
        status: 'RUNNING',
        attempts: row.attempts + 1,
        workerStep: null,
        errorLog: null,
        updatedAt: now,
      })
      .where(and(eq(schema.submissions.id, id), eq(schema.submissions.status, 'QUEUED')))
      .returning({ id: schema.submissions.id })
      .all();
    return updated.length > 0;
  }

  loadForRun(id: string) {
    return this.db
      .select()
      .from(schema.submissions)
      .where(eq(schema.submissions.id, id))
      .get();
  }

  countByStatus(): Record<string, number> {
    const rows = this.db
      .select({ status: schema.submissions.status, n: sql<number>`count(*)` })
      .from(schema.submissions)
      .groupBy(schema.submissions.status)
      .all();
    return Object.fromEntries(rows.map((r) => [r.status, Number(r.n)]));
  }
}
