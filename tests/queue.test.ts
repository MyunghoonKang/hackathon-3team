import { describe, it, expect, beforeEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { createDb } from '../src/server/db/client';
import * as schema from '../src/server/db/schema';
import { SubmissionQueue } from '../src/server/submissions/queue';

function seedSession(db: ReturnType<typeof createDb>): string {
  const sessionId = randomUUID();
  const now = new Date();
  db.insert(schema.sessions)
    .values({
      id: sessionId,
      roomCode: sessionId.slice(0, 4).toUpperCase(),
      status: 'FINISHED',
      hostId: 'host-1',
      createdAt: now,
      updatedAt: now,
    })
    .run();
  return sessionId;
}

describe('SubmissionQueue', () => {
  let db: ReturnType<typeof createDb>;
  let queue: SubmissionQueue;

  beforeEach(() => {
    db = createDb(':memory:');
    queue = new SubmissionQueue(db);
  });

  it('enqueue inserts a QUEUED row with attempts=0', () => {
    const sessionId = seedSession(db);
    const scheduledAt = new Date('2026-04-21T00:00:00Z');
    const id = queue.enqueue({ sessionId, scheduledAt });
    const row = db.select().from(schema.submissions).where(eq(schema.submissions.id, id)).get();
    expect(row).toBeDefined();
    expect(row!.status).toBe('QUEUED');
    expect(row!.sessionId).toBe(sessionId);
    expect(row!.attempts).toBe(0);
    expect(row!.scheduledAt.toISOString()).toBe(scheduledAt.toISOString());
  });

  it('claimNext returns the due item, transitions QUEUED→RUNNING, increments attempts', () => {
    const sessionId = seedSession(db);
    const id = queue.enqueue({ sessionId, scheduledAt: new Date('2026-04-19T00:00:00Z') });
    const claimed = queue.claimNext(new Date('2026-04-19T09:00:00Z'));
    expect(claimed).not.toBeNull();
    expect(claimed!.id).toBe(id);
    expect(claimed!.attempts).toBe(1);
    const row = db.select().from(schema.submissions).where(eq(schema.submissions.id, id)).get();
    expect(row!.status).toBe('RUNNING');
    expect(row!.attempts).toBe(1);
  });

  it('claimNext returns null when nothing is due (and is idempotent across calls)', () => {
    const sessionId = seedSession(db);
    queue.enqueue({ sessionId, scheduledAt: new Date('2026-04-19T00:00:00Z') });
    queue.claimNext(new Date('2026-04-19T09:00:00Z'));
    expect(queue.claimNext(new Date('2026-04-19T09:00:00Z'))).toBeNull();
  });

  it('claimNext skips items scheduled in the future', () => {
    const sessionId = seedSession(db);
    queue.enqueue({ sessionId, scheduledAt: new Date('2026-04-20T09:00:00Z') });
    expect(queue.claimNext(new Date('2026-04-19T09:00:00Z'))).toBeNull();
  });

  it('claimNext picks the oldest due row first', () => {
    const sessionId = seedSession(db);
    const later = queue.enqueue({ sessionId, scheduledAt: new Date('2026-04-19T08:00:00Z') });
    const earlier = queue.enqueue({ sessionId, scheduledAt: new Date('2026-04-19T07:00:00Z') });
    void later;
    const first = queue.claimNext(new Date('2026-04-19T09:00:00Z'));
    expect(first?.id).toBe(earlier);
  });

  it('complete transitions RUNNING→COMPLETED and stores erpRefNo', () => {
    const sessionId = seedSession(db);
    const id = queue.enqueue({ sessionId, scheduledAt: new Date(0) });
    queue.claimNext(new Date());
    queue.complete(id, { erpRefNo: 'ERP-1' });
    const row = db.select().from(schema.submissions).where(eq(schema.submissions.id, id)).get();
    expect(row!.status).toBe('COMPLETED');
    expect(row!.erpRefNo).toBe('ERP-1');
    expect(row!.workerStep).toBeNull();
  });

  it('fail transitions RUNNING→FAILED and stores errorLog', () => {
    const sessionId = seedSession(db);
    const id = queue.enqueue({ sessionId, scheduledAt: new Date(0) });
    queue.claimNext(new Date());
    queue.fail(id, { errorLog: 'boom' });
    const row = db.select().from(schema.submissions).where(eq(schema.submissions.id, id)).get();
    expect(row!.status).toBe('FAILED');
    expect(row!.errorLog).toBe('boom');
    expect(row!.workerStep).toBeNull();
  });

  it('updateWorkerStep records the current workerStep on a RUNNING row', () => {
    const sessionId = seedSession(db);
    const id = queue.enqueue({ sessionId, scheduledAt: new Date(0) });
    queue.claimNext(new Date());
    queue.updateWorkerStep(id, 'login');
    const row = db.select().from(schema.submissions).where(eq(schema.submissions.id, id)).get();
    expect(row!.workerStep).toBe('login');
  });

  it('recoverStuck resets RUNNING rows whose updatedAt is older than threshold', () => {
    const sessionId = seedSession(db);
    const id = queue.enqueue({ sessionId, scheduledAt: new Date(0) });
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    queue.claimNext(oneHourAgo); // claimNext stamps updatedAt = the passed `now`
    const reset = queue.recoverStuck({ thresholdMs: 30 * 60 * 1000 });
    expect(reset).toBe(1);
    const row = db.select().from(schema.submissions).where(eq(schema.submissions.id, id)).get();
    expect(row!.status).toBe('QUEUED');
    expect(row!.workerStep).toBeNull();
  });

  it('recoverStuck leaves recently-claimed RUNNING rows untouched', () => {
    const sessionId = seedSession(db);
    queue.enqueue({ sessionId, scheduledAt: new Date(0) });
    queue.claimNext(new Date()); // fresh
    expect(queue.recoverStuck({ thresholdMs: 30 * 60 * 1000 })).toBe(0);
  });

  it('loadForRun returns the row by id', () => {
    const sessionId = seedSession(db);
    const id = queue.enqueue({ sessionId, scheduledAt: new Date('2026-04-19T00:00:00Z') });
    const row = queue.loadForRun(id);
    expect(row?.id).toBe(id);
    expect(row?.sessionId).toBe(sessionId);
  });
});
