// B13: WORKER_MODE=mock 으로 데모 시나리오 1회 성공.
// 전체 플로우: FINISHED → CREDENTIAL_INPUT → QUEUED → RUNNING → COMPLETED
//
// 세 케이스를 커버:
//   (1) run-now 경로  — 데모 당일 수동 트리거 (주 경로)
//   (2) Scheduler.tick 경로 — 자동 polling 으로도 동일하게 완주
//   (3) FAILED 분기 — 워커 실패 시 RUNNING → FAILED + errorLog

import { describe, it, expect, beforeEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { buildApp, type BuiltApp } from '../src/server/app';
import { Scheduler } from '../src/server/submissions/scheduler';
import { createDb } from '../src/server/db/client';
import type { RoomStatePayload, WorkerStep } from '../src/shared/protocol';
import { WORKER_STEPS } from '../src/shared/protocol';

const VAULT_KEY = Buffer.alloc(32, 0xab);
const MOCK_ERP_REF = 'AP-2026-0420-001';

function finishedSnap(sessionId: string, loserId: string): RoomStatePayload {
  return {
    sessionId,
    roomCode: 'ABCD1234',
    status: 'FINISHED',
    players: [
      { id: 'p-host', name: '명훈', isHost: true, connected: true },
      { id: loserId, name: '지우', isHost: false, connected: true },
    ],
    hostId: 'p-host',
    loserId,
    results: [
      { playerId: 'p-host', value: 7 },
      { playerId: loserId, value: 13 },
    ],
    updatedAt: new Date().toISOString(),
  };
}

// run-now 경로 mock: 호출 시점에 SessionManager 는 이미 RUNNING.
// 4 단계 workerStep → COMPLETED 전이.
function makeRunNowMock(
  getBuilt: () => BuiltApp,
  sessionId: string,
  log: string[],
): (id: string) => Promise<void> {
  return async (submissionId) => {
    const b = getBuilt();
    for (const step of WORKER_STEPS as readonly WorkerStep[]) {
      b.queue.updateWorkerStep(submissionId, step);
      log.push(step);
      await new Promise<void>((r) => setTimeout(r, 1));
    }
    b.queue.complete(submissionId, { erpRefNo: MOCK_ERP_REF });
    b.mgr.transitionStatus({ sessionId, to: 'COMPLETED', patch: { erpRefNo: MOCK_ERP_REF } });
    log.push('COMPLETED');
  };
}

// Scheduler 경로 mock: Scheduler.tick 은 SessionManager 를 건드리지 않으므로
// 워커가 직접 QUEUED→RUNNING→COMPLETED 전이를 수행한다.
function makeSchedulerMock(
  getBuilt: () => BuiltApp,
  sessionId: string,
  log: string[],
): (id: string) => Promise<void> {
  return async (submissionId) => {
    const b = getBuilt();
    // Scheduler 는 claimNext 로 DB row 만 RUNNING 으로 전이.
    // SessionManager snap 은 워커가 책임진다.
    b.mgr.transitionStatus({
      sessionId,
      to: 'RUNNING',
      patch: { workerStep: 'login', submissionId },
    });
    for (const step of WORKER_STEPS as readonly WorkerStep[]) {
      b.queue.updateWorkerStep(submissionId, step);
      log.push(step);
    }
    b.queue.complete(submissionId, { erpRefNo: MOCK_ERP_REF });
    b.mgr.transitionStatus({ sessionId, to: 'COMPLETED', patch: { erpRefNo: MOCK_ERP_REF } });
    log.push('COMPLETED');
  };
}

describe('B13 E2E mock — FINISHED → COMPLETED 전체 시나리오', () => {
  let sessionId: string;
  let loserId: string;

  beforeEach(() => {
    sessionId = randomUUID();
    loserId = 'E' + randomUUID().slice(0, 6); // userId ≤ 32자 (사번 형식)
  });

  // ---------------------------------------------------------------------------
  // (1) run-now 경로 — 데모 당일 수동 트리거 (주 경로)
  // ---------------------------------------------------------------------------
  it('run-now 경로: 자격증명 → credential-input → QUEUED → run-now → COMPLETED', async () => {
    const log: string[] = [];
    let built: BuiltApp;

    built = buildApp({
      vaultKey: VAULT_KEY,
      db: createDb(':memory:'),
      workerMode: 'mock',
      runSubmission: makeRunNowMock(() => built, sessionId, log),
    });

    // FINISHED 상태 세션 시드 (register 가 sessions 테이블 upsert → FK 보장)
    built.mgr.register(finishedSnap(sessionId, loserId));

    // 1. 자격증명 vault 저장
    await request(built.app)
      .post('/api/credentials')
      .send({ sessionId, userId: loserId, loginId: 'jiwoo@meissa', password: 'pw123' })
      .expect(204);

    // 2. FINISHED → CREDENTIAL_INPUT
    await request(built.app)
      .post(`/api/sessions/${sessionId}/credential-input`)
      .expect(204);
    expect(built.mgr.getById(sessionId)?.status).toBe('CREDENTIAL_INPUT');

    // 3. CREDENTIAL_INPUT → QUEUED
    const queueRes = await request(built.app)
      .post(`/api/sessions/${sessionId}/submissions`)
      .expect(200);
    const { submissionId, scheduledAt } = queueRes.body as {
      submissionId: string;
      scheduledAt: string;
    };
    expect(typeof submissionId).toBe('string');
    // scheduledAt 은 미래 영업일 09:00 KST
    expect(new Date(scheduledAt).getTime()).toBeGreaterThan(Date.now());

    const snapQueued = built.mgr.getById(sessionId);
    expect(snapQueued?.status).toBe('QUEUED');
    expect(snapQueued?.submissionId).toBe(submissionId);
    expect(snapQueued?.scheduledAt).toBe(scheduledAt);

    // 4. QUEUED → RUNNING (mock 모드 — run-now 즉시 허용)
    const runRes = await request(built.app)
      .post(`/api/submissions/${submissionId}/run-now`)
      .expect(202);
    expect(runRes.body).toEqual({ ok: true, submissionId });

    const snapRunning = built.mgr.getById(sessionId);
    expect(snapRunning?.status).toBe('RUNNING');
    expect(snapRunning?.workerStep).toBe('login'); // run-now 가 첫 step 으로 세팅

    // run-now 는 queue DB row 도 RUNNING 으로 전이 (claimById)
    expect(built.queue.loadForRun(submissionId)?.status).toBe('RUNNING');

    // 5. fire-and-forget 완료 대기
    await new Promise<void>((r) => setTimeout(r, 100));

    // 6. 최종 상태: COMPLETED + erpRefNo
    const snapFinal = built.mgr.getById(sessionId);
    expect(snapFinal?.status).toBe('COMPLETED');
    expect(snapFinal?.erpRefNo).toBe(MOCK_ERP_REF);

    // DB row 도 COMPLETED
    const row = built.queue.loadForRun(submissionId);
    expect(row?.status).toBe('COMPLETED');
    expect(row?.erpRefNo).toBe(MOCK_ERP_REF);
    expect(row?.workerStep).toBeNull(); // complete() 가 step 초기화

    // 4 단계 순서 확인
    expect(log).toEqual(['login', 'cardModal', 'formFill', 'approval', 'COMPLETED']);
  });

  // ---------------------------------------------------------------------------
  // (2) Scheduler.tick 경로 — 자동 polling (scheduledAt 이 과거면 즉시 클레임)
  // ---------------------------------------------------------------------------
  it('Scheduler.tick 경로: 과거 scheduledAt → tick → COMPLETED', async () => {
    const log: string[] = [];
    let built: BuiltApp;

    built = buildApp({
      vaultKey: VAULT_KEY,
      db: createDb(':memory:'),
      workerMode: 'mock',
      // Scheduler 가 호출하는 runSubmission — mgr RUNNING 전이 포함
      runSubmission: makeSchedulerMock(() => built, sessionId, log),
    });

    built.mgr.register(finishedSnap(sessionId, loserId));

    // FINISHED → CREDENTIAL_INPUT → QUEUED (scheduledAt 을 과거로 → 즉시 due)
    built.mgr.transitionStatus({ sessionId, to: 'CREDENTIAL_INPUT' });
    const pastDate = new Date(Date.now() - 1000);
    const submissionId = built.queue.enqueue({ sessionId, scheduledAt: pastDate });
    built.mgr.transitionStatus({
      sessionId,
      to: 'QUEUED',
      patch: { submissionId, scheduledAt: pastDate.toISOString() },
    });

    const scheduler = new Scheduler({
      queue: built.queue,
      runSubmission: makeSchedulerMock(() => built, sessionId, log),
    });

    // tick 1회 — claimNext 가 위 row 를 RUNNING 으로 전이 + mock worker fire
    await scheduler.tick();
    await new Promise<void>((r) => setTimeout(r, 100));

    const snapFinal = built.mgr.getById(sessionId);
    expect(snapFinal?.status).toBe('COMPLETED');
    expect(snapFinal?.erpRefNo).toBe(MOCK_ERP_REF);

    const row = built.queue.loadForRun(submissionId);
    expect(row?.status).toBe('COMPLETED');
    expect(row?.erpRefNo).toBe(MOCK_ERP_REF);

    expect(log).toEqual(['login', 'cardModal', 'formFill', 'approval', 'COMPLETED']);
  });

  // ---------------------------------------------------------------------------
  // (3) FAILED 분기 — 워커 실패 시 RUNNING → FAILED + errorLog
  // ---------------------------------------------------------------------------
  it('워커 실패 시 RUNNING → FAILED + errorLog', async () => {
    const FAIL_MSG = 'CAPTCHA 감지: FAILED_UNEXPECTED_UI';
    let built: BuiltApp;

    built = buildApp({
      vaultKey: VAULT_KEY,
      db: createDb(':memory:'),
      workerMode: 'mock',
      runSubmission: async (submissionId) => {
        // run-now 호출 후 → SessionManager: RUNNING, queue row: RUNNING
        built.queue.fail(submissionId, { errorLog: FAIL_MSG });
        built.mgr.transitionStatus({
          sessionId,
          to: 'FAILED',
          patch: { errorLog: FAIL_MSG },
        });
      },
    });

    built.mgr.register(finishedSnap(sessionId, loserId));
    built.mgr.transitionStatus({ sessionId, to: 'CREDENTIAL_INPUT' });

    const subRes = await request(built.app)
      .post(`/api/sessions/${sessionId}/submissions`)
      .expect(200);
    const { submissionId } = subRes.body as { submissionId: string };

    await request(built.app)
      .post(`/api/submissions/${submissionId}/run-now`)
      .expect(202);

    await new Promise<void>((r) => setTimeout(r, 50));

    const snap = built.mgr.getById(sessionId);
    expect(snap?.status).toBe('FAILED');
    expect(snap?.errorLog).toBe(FAIL_MSG);

    const row = built.queue.loadForRun(submissionId);
    expect(row?.status).toBe('FAILED');
    expect(row?.errorLog).toBe(FAIL_MSG);
  });
});
