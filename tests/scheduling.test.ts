import { describe, it, expect, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { createDb } from '../src/server/db/client';
import * as schema from '../src/server/db/schema';
import { SubmissionQueue } from '../src/server/submissions/queue';
import { nextBusinessDayNineAm } from '../src/server/submissions/scheduling';
import { Scheduler } from '../src/server/submissions/scheduler';

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

describe('nextBusinessDayNineAm (Asia/Seoul)', () => {
  it('weekday evening → next day 09:00 KST', () => {
    // 2026-04-20 (Mon) 20:00 KST = 2026-04-20T11:00Z
    const at = nextBusinessDayNineAm(new Date('2026-04-20T11:00:00Z'));
    expect(at.toISOString()).toBe('2026-04-21T00:00:00.000Z'); // 09:00 KST = 00:00Z
  });

  it('Friday evening → next Monday 09:00 KST', () => {
    // 2026-04-24 (Fri) 20:00 KST
    const at = nextBusinessDayNineAm(new Date('2026-04-24T11:00:00Z'));
    expect(at.toISOString()).toBe('2026-04-27T00:00:00.000Z');
  });

  it('Saturday → Monday', () => {
    const at = nextBusinessDayNineAm(new Date('2026-04-25T11:00:00Z'));
    expect(at.toISOString()).toBe('2026-04-27T00:00:00.000Z');
  });

  it('weekday 08:00 KST → same day 09:00 KST', () => {
    // 2026-04-21 (Tue) 08:00 KST = 2026-04-20T23:00Z
    const at = nextBusinessDayNineAm(new Date('2026-04-20T23:00:00Z'));
    expect(at.toISOString()).toBe('2026-04-21T00:00:00.000Z');
  });
});

describe('Scheduler.tick', () => {
  it('claims a due submission and fires runSubmission', async () => {
    const db = createDb(':memory:');
    const queue = new SubmissionQueue(db);
    const sessionId = seedSession(db);
    const id = queue.enqueue({ sessionId, scheduledAt: new Date('2026-04-19T00:00:00Z') });

    const runSubmission = vi.fn().mockResolvedValue(undefined);
    const scheduler = new Scheduler({ queue, runSubmission });
    await scheduler.tick();

    expect(runSubmission).toHaveBeenCalledTimes(1);
    expect(runSubmission).toHaveBeenCalledWith(id);
    expect(queue.loadForRun(id)!.status).toBe('RUNNING');
  });

  it('skips runSubmission when no due item', async () => {
    const db = createDb(':memory:');
    const queue = new SubmissionQueue(db);
    const runSubmission = vi.fn().mockResolvedValue(undefined);
    const scheduler = new Scheduler({ queue, runSubmission });
    await scheduler.tick();
    expect(runSubmission).not.toHaveBeenCalled();
  });

  it('recovers stuck RUNNING rows before claiming', async () => {
    const db = createDb(':memory:');
    const queue = new SubmissionQueue(db);
    const sessionId = seedSession(db);
    const stuckId = queue.enqueue({ sessionId, scheduledAt: new Date('2026-04-19T00:00:00Z') });
    // 인위적 stuck: 바로 claim 후 updatedAt 를 threshold 넘어서 과거로 밀어둠.
    queue.claimNext(new Date('2026-04-19T00:00:01Z'));
    db.update(schema.submissions)
      .set({ updatedAt: new Date(Date.now() - 60 * 60 * 1000) })
      .run();

    const runSubmission = vi.fn().mockResolvedValue(undefined);
    const scheduler = new Scheduler({ queue, runSubmission, stuckThresholdMs: 30 * 60 * 1000 });
    await scheduler.tick();

    expect(runSubmission).toHaveBeenCalledWith(stuckId);
    expect(queue.loadForRun(stuckId)!.status).toBe('RUNNING');
    expect(queue.loadForRun(stuckId)!.attempts).toBe(2);
  });
});
