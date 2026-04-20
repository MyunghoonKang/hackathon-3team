// 공동 계약 (H+0~2) · Plan A GameRunner → Plan B enqueue 결합 지점
// 시그니처 고정: onGameFinished(sessionId, loserId): Promise<void>
// 4A B12 — no-op 을 실 구현으로 교체 (FINISHED → CREDENTIAL_INPUT 전이 + broadcast).
//
// 두 가지 진입점 제공:
//   1) createSubmissionHook({ mgr, io }) — 의존성 주입 팩토리. 테스트에서 직접 사용.
//   2) onGameFinished(sessionId, loserId) — 모듈 레벨 export. 3A GameRunner 가
//      직접 import 하는 계약 시그니처. 사용 전 registerSubmissionHook 으로 한 번
//      바인딩되어야 함 (app.ts buildApp 에서 자동 호출).

import type { Server as IOServer } from 'socket.io';
import { broadcastRoomState } from '../io';
import type { SessionManager } from '../session/manager';

export interface SubmissionHookDeps {
  mgr: SessionManager;
  io: IOServer | null;
}

export type SubmissionHook = (sessionId: string, loserId: string) => Promise<void>;

export function createSubmissionHook(deps: SubmissionHookDeps): SubmissionHook {
  return async function onGameFinishedBound(
    sessionId: string,
    loserId: string,
  ): Promise<void> {
    const snap = deps.mgr.transitionStatus({
      sessionId,
      to: 'CREDENTIAL_INPUT',
      patch: { loserId },
    });
    broadcastRoomState(deps.io, snap);
  };
}

let registered: SubmissionHook | null = null;

export function registerSubmissionHook(deps: SubmissionHookDeps): void {
  registered = createSubmissionHook(deps);
}

// 테스트 후처리용. 프로덕션 경로에서는 호출하지 않는다.
export function resetSubmissionHookForTests(): void {
  registered = null;
}

export async function onGameFinished(
  sessionId: string,
  loserId: string,
): Promise<void> {
  if (!registered) {
    console.warn(
      '[submissionHook] hook not registered — game finish ignored',
      { sessionId, loserId },
    );
    return;
  }
  await registered(sessionId, loserId);
}
