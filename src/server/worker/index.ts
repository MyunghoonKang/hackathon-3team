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

  // B7 에서 login 모듈(login · loginUrlFor · LoginError) 을 export. 4A 는 Scheduler(B5)
  // · /run-now(B11) 에서 submissionId → sessionId lookup → CredentialVault.load 후
  // launchBrowser + login() 을 직접 orchestrate 한다 (dev4.md 계약: deps 주입 불가 ·
  // 이 파일 내부에서 SessionManager/SubmissionQueue singleton 을 import 하는 패턴은
  // 4A 가 B4 머지 시점에 결정). 그 orchestration 이 붙기 전까지는 스텁 FAILED 유지.
  return {
    status: 'FAILED',
    errorLog: `worker stub (mode=${mode}) — B8~B10 (cardModal · formFill · approval) · runSubmission orchestration 미구현. login() 은 별도 export.`,
  };
}

// 단계 라벨. 4B 가 `transitionStatus(RUNNING, { workerStep })` 호출 시 사용.
// 공동 계약 protocol.ts 의 WorkerStep 과 1:1 대응.
export const WORKER_STEP_ORDER: readonly WorkerStep[] = ['login', 'cardModal', 'formFill', 'approval'];

export { resolveMode } from './mode';
export type { WorkerMode } from './mode';
export { launchBrowser } from './browser';
export type { BrowserSession } from './browser';
export { login, loginUrlFor, LoginError, mockLoginUrl } from './login';
export type { LoginOptions } from './login';
