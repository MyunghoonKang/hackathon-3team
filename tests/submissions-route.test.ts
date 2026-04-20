import { describe, it, expect, beforeEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { buildApp } from '../src/server/app';
import { createDb } from '../src/server/db/client';
import * as schema from '../src/server/db/schema';
import type { RoomStatePayload, RoomStatus } from '../src/shared/protocol';

const KEY = Buffer.alloc(32, 1);

function makeSnap(
  sessionId: string,
  status: RoomStatus,
  patch: Partial<RoomStatePayload> = {},
): RoomStatePayload {
  return {
    sessionId,
    roomCode: sessionId.slice(0, 8).toUpperCase(),
    status,
    players: [
      { id: 'p-host', name: 'host', isHost: true, connected: true },
      { id: 'p-guest', name: 'guest', isHost: false, connected: true },
    ],
    hostId: 'p-host',
    updatedAt: new Date().toISOString(),
    ...patch,
  };
}

describe('submissions routes (B11)', () => {
  let built: ReturnType<typeof buildApp>;
  let runSubmissionCalls: string[];

  beforeEach(() => {
    runSubmissionCalls = [];
    const db = createDb(':memory:');
    built = buildApp({
      vaultKey: KEY,
      db,
      workerMode: 'mock',
      runSubmission: async (id) => {
        runSubmissionCalls.push(id);
      },
    });
  });

  describe('POST /api/sessions/:id/credential-input', () => {
    it('transitions FINISHED → CREDENTIAL_INPUT and returns 204', async () => {
      const sessionId = randomUUID();
      built.mgr.register(makeSnap(sessionId, 'FINISHED', { loserId: 'p-guest' }));

      const res = await request(built.app)
        .post(`/api/sessions/${sessionId}/credential-input`)
        .send();

      expect(res.status).toBe(204);
      expect(built.mgr.getById(sessionId)?.status).toBe('CREDENTIAL_INPUT');
    });

    it('returns 404 when session not registered', async () => {
      const res = await request(built.app)
        .post(`/api/sessions/${randomUUID()}/credential-input`)
        .send();
      expect(res.status).toBe(404);
      expect(res.body.error).toBe('session_not_found');
    });

    it('returns 409 on illegal transition (PREPARING → CREDENTIAL_INPUT)', async () => {
      const sessionId = randomUUID();
      built.mgr.register(makeSnap(sessionId, 'PREPARING'));
      const res = await request(built.app)
        .post(`/api/sessions/${sessionId}/credential-input`)
        .send();
      expect(res.status).toBe(409);
      expect(res.body.error).toBe('illegal_transition');
    });
  });

  describe('POST /api/sessions/:id/submissions', () => {
    it('enqueues + transitions to QUEUED + returns {submissionId, scheduledAt}', async () => {
      const sessionId = randomUUID();
      built.mgr.register(makeSnap(sessionId, 'CREDENTIAL_INPUT', { loserId: 'p-guest' }));

      const res = await request(built.app)
        .post(`/api/sessions/${sessionId}/submissions`)
        .send({ loserId: 'p-guest' });

      expect(res.status).toBe(200);
      expect(typeof res.body.submissionId).toBe('string');
      expect(typeof res.body.scheduledAt).toBe('string');

      const snap = built.mgr.getById(sessionId);
      expect(snap?.status).toBe('QUEUED');
      expect(snap?.submissionId).toBe(res.body.submissionId);
      expect(snap?.scheduledAt).toBe(res.body.scheduledAt);

      // submissions 테이블에도 실제로 들어갔는지
      const rows = built.db.select().from(schema.submissions).all();
      expect(rows).toHaveLength(1);
      expect(rows[0]!.sessionId).toBe(sessionId);
      expect(rows[0]!.status).toBe('QUEUED');
    });

    it('succeeds even when sessions row is empty (FK guard via upsert)', async () => {
      // mgr.register 가 아예 안 불린 상황: 이전 run 의 SessionManager.persist 누락 버그 재현.
      const sessionId = randomUUID();
      built.mgr.register(makeSnap(sessionId, 'CREDENTIAL_INPUT'));
      // sessions 테이블을 강제로 비우고 라우트 호출 (route 의 onConflictDoNothing 가드 검증)
      built.db.delete(schema.sessions).run();

      const res = await request(built.app)
        .post(`/api/sessions/${sessionId}/submissions`)
        .send({});

      expect(res.status).toBe(200);
      expect(res.body.submissionId).toBeDefined();
    });

    it('returns 409 on illegal transition (PLAYING → QUEUED)', async () => {
      const sessionId = randomUUID();
      built.mgr.register(makeSnap(sessionId, 'PLAYING'));
      const res = await request(built.app)
        .post(`/api/sessions/${sessionId}/submissions`)
        .send({});
      expect(res.status).toBe(409);
      expect(res.body.error).toBe('illegal_transition');
    });
  });

  describe('POST /api/submissions/:id/run-now', () => {
    async function seedQueuedSubmission(): Promise<{ sessionId: string; submissionId: string }> {
      const sessionId = randomUUID();
      built.mgr.register(makeSnap(sessionId, 'CREDENTIAL_INPUT'));
      const enq = await request(built.app)
        .post(`/api/sessions/${sessionId}/submissions`)
        .send({});
      return { sessionId, submissionId: enq.body.submissionId as string };
    }

    it('in mock mode, transitions to RUNNING + fires runSubmission + returns 202', async () => {
      const { sessionId, submissionId } = await seedQueuedSubmission();

      const res = await request(built.app)
        .post(`/api/submissions/${submissionId}/run-now`)
        .send();

      expect(res.status).toBe(202);
      expect(res.body).toEqual({ ok: true, submissionId });

      const snap = built.mgr.getById(sessionId);
      expect(snap?.status).toBe('RUNNING');
      expect(snap?.workerStep).toBe('login');

      // fire-and-forget 이 동기적으로 예약돼야 함 — 짧게 대기
      await new Promise((r) => setTimeout(r, 10));
      expect(runSubmissionCalls).toEqual([submissionId]);
    });

    it('in live mode, returns 422 without X-Demo-Confirm header', async () => {
      // live 모드로 재구성
      const db = createDb(':memory:');
      const built2 = buildApp({
        vaultKey: KEY,
        db,
        workerMode: 'live',
        runSubmission: async () => {},
      });
      const sessionId = randomUUID();
      built2.mgr.register(makeSnap(sessionId, 'CREDENTIAL_INPUT'));
      const enq = await request(built2.app)
        .post(`/api/sessions/${sessionId}/submissions`)
        .send({});
      const submissionId = enq.body.submissionId;

      const res = await request(built2.app)
        .post(`/api/submissions/${submissionId}/run-now`)
        .send();
      expect(res.status).toBe(422);
      expect(res.body.error).toBe('run_now_gated');
    });

    it('in live mode, allows run-now with X-Demo-Confirm: yes header', async () => {
      const db = createDb(':memory:');
      const runs: string[] = [];
      const built2 = buildApp({
        vaultKey: KEY,
        db,
        workerMode: 'live',
        runSubmission: async (id) => {
          runs.push(id);
        },
      });
      const sessionId = randomUUID();
      built2.mgr.register(makeSnap(sessionId, 'CREDENTIAL_INPUT'));
      const enq = await request(built2.app)
        .post(`/api/sessions/${sessionId}/submissions`)
        .send({});
      const submissionId = enq.body.submissionId;

      const res = await request(built2.app)
        .post(`/api/submissions/${submissionId}/run-now`)
        .set('X-Demo-Confirm', 'yes')
        .send();
      expect(res.status).toBe(202);
      await new Promise((r) => setTimeout(r, 10));
      expect(runs).toEqual([submissionId]);
    });

    it('returns 404 when submission does not exist', async () => {
      const res = await request(built.app)
        .post(`/api/submissions/${randomUUID()}/run-now`)
        .send();
      expect(res.status).toBe(404);
      expect(res.body.error).toBe('submission_not_found');
    });
  });

  describe('GET /api/submissions/:id', () => {
    it('returns 404 when missing', async () => {
      const res = await request(built.app)
        .get(`/api/submissions/${randomUUID()}`)
        .send();
      expect(res.status).toBe(404);
    });

    it('returns row when present', async () => {
      const sessionId = randomUUID();
      built.mgr.register(makeSnap(sessionId, 'CREDENTIAL_INPUT'));
      const enq = await request(built.app)
        .post(`/api/sessions/${sessionId}/submissions`)
        .send({});
      const submissionId = enq.body.submissionId;

      const res = await request(built.app)
        .get(`/api/submissions/${submissionId}`)
        .send();
      expect(res.status).toBe(200);
      expect(res.body.id).toBe(submissionId);
      expect(res.body.sessionId).toBe(sessionId);
      expect(res.body.status).toBe('QUEUED');
    });
  });
});
