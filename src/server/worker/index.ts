import type { WorkerResult, WorkerStep } from '../../shared/protocol';
import { resolveMode, type WorkerMode } from './mode';
import { makeScreenshotDir } from './screenshots';

// -----------------------------------------------------------------------------
// 4B ↔ 4A 계약 (dev4.md §4B 와의 계약 · 공동 계약 세션에서 고정).
// 4A 의 Scheduler(B5) 와 /run-now 라우트(B11) 가 이 한 함수만 import.
// 시그니처 변경 금지 — 변경이 필요하면 양 세션 명시적 동기화.
// -----------------------------------------------------------------------------

export async function runSubmission(submissionId: string): Promise<WorkerResult> {
  // 모드 해석은 항상 선행 — 잘못된 env 로 부팅된 경우 조기 실패.
  const mode: WorkerMode = resolveMode(process.env);

  // 스크린샷 디렉터리는 mock 모드에서도 만든다. 데모 후 로그와 대조할 때 경로가 필요.
  makeScreenshotDir(submissionId);

  // B6 스캐폴딩 단계 · B7~B10 에서 login/cardModal/formFill/approval 각 단계를
  // 순차 구현하며 아래 분기를 실제 Playwright 흐름으로 교체한다.
  // 4A 는 이미 이 함수를 await 으로 받아 COMPLETED/FAILED 를 broadcast 하므로,
  // stub 이 안전하게 FAILED 를 반환하면 E2E mock (B13) 도 'FAILED 테스트 통로' 로 동작.
  return {
    status: 'FAILED',
    errorLog: `worker stub (mode=${mode}) — B7~B10 (login · cardModal · formFill · approval) 미구현`,
  };
}

// 단계 라벨. 4B 가 `transitionStatus(RUNNING, { workerStep })` 호출 시 사용.
// 공동 계약 protocol.ts 의 WorkerStep 과 1:1 대응.
export const WORKER_STEP_ORDER: readonly WorkerStep[] = ['login', 'cardModal', 'formFill', 'approval'];

export { resolveMode } from './mode';
export type { WorkerMode } from './mode';
