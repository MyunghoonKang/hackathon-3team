import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { buildApp } from '../src/server/app';
import { createDb } from '../src/server/db/client';
import {
  clearWorkerDeps,
  runSubmission,
  setWorkerDeps,
} from '../src/server/worker/index';

// B13 · 데모 시나리오 1회 성공 — WORKER_MODE=mock 으로 풀 플로우 녹색 확인.
//
//   PREPARING → PLAYING → FINISHED → CREDENTIAL_INPUT → QUEUED → RUNNING → COMPLETED
//
// 4A 의 REST 4 라우트 + 4B 의 runSubmission 오케스트레이션(login → cardModal →
// formFill → approval) 이 같은 SessionManager/SubmissionQueue 를 공유한 상태에서
// 끝까지 굴러가는지 검증한다. 실 Playwright(chromium headless) + mock HTML 3 종을
// 그대로 사용하므로 런타임은 수십 초. CI 에서 부담되면 .only · describe.skipIf 로 가드.

const VAULT_KEY = Buffer.alloc(32, 0x17);
const DEMO_TIMEOUT_MS = 120_000;

describe('B13 E2E mock — 데모 시나리오', () => {
  const origEnv = process.env.WORKER_MODE;

  beforeAll(() => {
    process.env.WORKER_MODE = 'mock';
  });

  afterAll(() => {
    clearWorkerDeps();
    if (origEnv === undefined) delete process.env.WORKER_MODE;
    else process.env.WORKER_MODE = origEnv;
  });

  it(
    'PREPARING → PLAYING → FINISHED → CREDENTIAL_INPUT → QUEUED → RUNNING → COMPLETED',
    async () => {
      const db = createDb(':memory:');
      const built = buildApp({
        vaultKey: VAULT_KEY,
        db,
        workerMode: 'mock',
        runSubmission: async (id) => {
          await runSubmission(id);
        },
      });

      // 1. Plan A 게임 라이프사이클 — host + guest 2명, host 가 승자.
      const host = built.mgr.createSession({ name: '명훈' });
      const afterJoin = built.mgr.join({ roomCode: host.roomCode, name: '지우' });
      const guest = afterJoin.players.find((p) => p.name === '지우')!;
      expect(guest).toBeTruthy();

      built.mgr.selectGame({
        sessionId: host.id,
        actorId: host.hostId,
        gameId: 'mock-game',
      });
      built.mgr.startGame({ sessionId: host.id, actorId: host.hostId });
      built.mgr.finishGame({
        sessionId: host.id,
        loserId: guest.id,
        results: [
          { playerId: host.hostId, value: 13 },
          { playerId: guest.id, value: 3 },
        ],
      });
      expect(built.mgr.getById(host.id)?.status).toBe('FINISHED');

      // 2. 자격증명 저장 (POST /api/credentials · 204).
      const credRes = await request(built.app).post('/api/credentials').send({
        sessionId: host.id,
        userId: '100001',
        loginId: 'alice',
        password: 'pw1234',
      });
      expect(credRes.status).toBe(204);

      // 3. FINISHED → CREDENTIAL_INPUT.
      const ciRes = await request(built.app)
        .post(`/api/sessions/${host.id}/credential-input`)
        .send();
      expect(ciRes.status).toBe(204);
      expect(built.mgr.getById(host.id)?.status).toBe('CREDENTIAL_INPUT');

      // 4. CREDENTIAL_INPUT → QUEUED (submissionId 발급).
      const enqRes = await request(built.app)
        .post(`/api/sessions/${host.id}/submissions`)
        .send({ loserId: guest.id });
      expect(enqRes.status).toBe(200);
      const submissionId = enqRes.body.submissionId as string;
      expect(typeof submissionId).toBe('string');
      expect(built.mgr.getById(host.id)?.status).toBe('QUEUED');

      // 5. 4B 워커 deps 주입 — runSubmission 이 executeSubmission 으로 위임되도록.
      setWorkerDeps({
        db: built.db,
        queue: built.queue,
        mgr: built.mgr,
        io: null,
        vault: built.vault,
        mode: 'mock',
        env: { WORKER_MODE: 'mock' },
        headless: true,
      });

      // 6. QUEUED → RUNNING + fire-and-forget runSubmission.
      const runRes = await request(built.app)
        .post(`/api/submissions/${submissionId}/run-now`)
        .send();
      expect(runRes.status).toBe(202);
      expect(runRes.body).toEqual({ ok: true, submissionId });

      // 7. 워커가 login → cardModal → formFill → approval → COMPLETED 까지 진행하기를
      //    폴링으로 대기. mgr 과 queue 양쪽 상태 일치 확인.
      const deadline = Date.now() + DEMO_TIMEOUT_MS - 5_000;
      let finalStatus = built.mgr.getById(host.id)?.status;
      while (
        Date.now() < deadline &&
        finalStatus !== 'COMPLETED' &&
        finalStatus !== 'FAILED'
      ) {
        await new Promise((r) => setTimeout(r, 250));
        finalStatus = built.mgr.getById(host.id)?.status;
      }

      const finalSnap = built.mgr.getById(host.id);
      if (finalSnap?.status !== 'COMPLETED') {
        // 실패 진단 출력 — B13 디버깅 편의.
        const row = built.queue.loadForRun(submissionId);
        throw new Error(
          `expected COMPLETED, got ${finalSnap?.status}. ` +
            `workerStep=${finalSnap?.workerStep ?? '(none)'}. ` +
            `errorLog=${finalSnap?.errorLog ?? row?.errorLog ?? '(none)'}`,
        );
      }
      expect(finalSnap.status).toBe('COMPLETED');
      expect(finalSnap.erpRefNo).toBeTruthy();

      const queuedRow = built.queue.loadForRun(submissionId);
      expect(queuedRow?.status).toBe('COMPLETED');
      expect(queuedRow?.erpRefNo).toBeTruthy();
    },
    DEMO_TIMEOUT_MS,
  );
});
