import type { WorkerResult, WorkerStep } from '../../shared/protocol';
import { resolveMode, type WorkerMode } from './mode';
import { executeSubmission, type WorkerDeps } from './orchestrator';

// -----------------------------------------------------------------------------
// 4B ↔ 4A 계약 (dev4.md §4B 와의 계약 · 공동 계약 세션에서 고정).
// 4A 의 Scheduler(B5) 와 /run-now 라우트(B11) 가 이 한 함수만 import.
// 시그니처 변경 금지 — runSubmission(submissionId): Promise<WorkerResult>.
// -----------------------------------------------------------------------------
//
// deps 주입 모델: 서버 부트스트랩(src/server/index.ts)이 buildApp() 직후
// setWorkerDeps({ db, queue, mgr, io, vault, mode }) 한 번 호출해 모듈 레벨
// holder 를 채운다. runSubmission 은 holder 가 채워져 있으면 executeSubmission
// 으로 위임하고, 없으면 기존 stub(FAILED) 를 반환해 4A 단독 부팅·테스트에서도
// 시그니처가 깨지지 않게 한다.

let workerDeps: WorkerDeps | null = null;

export function setWorkerDeps(deps: WorkerDeps): void {
  workerDeps = deps;
}

export function clearWorkerDeps(): void {
  workerDeps = null;
}

export async function runSubmission(submissionId: string): Promise<WorkerResult> {
  if (!workerDeps) {
    const mode: WorkerMode = resolveMode(process.env);
    return {
      status: 'FAILED',
      errorLog: `worker stub (mode=${mode}) — runSubmission orchestration 미구현. setWorkerDeps() 미호출.`,
    };
  }
  return executeSubmission(workerDeps, submissionId);
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
export { executeSubmission } from './orchestrator';
export type { WorkerDeps } from './orchestrator';
