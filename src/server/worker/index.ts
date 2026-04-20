import type { WorkerResult, WorkerStep } from '../../shared/protocol';
import { resolveMode, type WorkerMode } from './mode';
import { makeScreenshotDir } from './screenshots';

// -----------------------------------------------------------------------------
// 4B ↔ 4A 계약 (dev4.md §4B 와의 계약 · 공동 계약 세션에서 고정).
// 4A 의 Scheduler(B5) 와 /run-now 라우트(B11) 가 이 한 함수만 import.
// 시그니처 변경 금지 — 변경이 필요하면 양 세션 명시적 동기화.
// -----------------------------------------------------------------------------

export async function runSubmission(submissionId: string): Promise<WorkerResult> {
  const mode: WorkerMode = resolveMode(process.env);
  makeScreenshotDir(submissionId);

  // runSubmission 풀 오케스트레이션은 4A B5 Scheduler 가 login → cardModal → formFill →
  // approval 순으로 호출하도록 연결할 예정. 각 단계 함수(login/fillForm/openApprovalAndInject)
  // 는 별도 export 로 제공. 오케스트레이션 연결 전까지 스텁 유지.
  return {
    status: 'FAILED',
    errorLog: `worker stub (mode=${mode}) — runSubmission orchestration 미구현. 각 단계(login · cardModal · formFill · approval)는 별도 export.`,
  };
}

export const WORKER_STEP_ORDER: readonly WorkerStep[] = ['login', 'cardModal', 'formFill', 'approval'];

export { resolveMode } from './mode';
export type { WorkerMode } from './mode';
export { launchBrowser } from './browser';
export type { BrowserSession } from './browser';
export { login, loginUrlFor, LoginError, mockLoginUrl } from './login';
export type { LoginOptions } from './login';
export { fillForm, defaultTitle, FormFillError } from './formFill';
export type { FillInput, PurposeKind } from './formFill';
export { openApprovalAndInject, injectAttendees } from './approval';
export type { ApprovalInput } from './approval';
