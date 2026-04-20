// WORKER_MODE 해석기.
// mock   : Playwright 를 띄우되 목업 HTML 경로(file://) 로만 이동. 기본값.
// dryrun : 실 ERP 까지 진입하되 최종 [상신] 은 스킵.
// live   : 실 ERP 전체 플로우. B14 한정 · ERP_CONFIRM_SUBMIT=1 필수.
export type WorkerMode = 'mock' | 'dryrun' | 'live';

export function resolveMode(env: NodeJS.ProcessEnv): WorkerMode {
  const raw = (env.WORKER_MODE ?? 'mock').toLowerCase();
  if (raw === 'mock' || raw === 'dryrun' || raw === 'live') return raw;
  throw new Error(`Invalid WORKER_MODE: ${env.WORKER_MODE}`);
}

// live 모드 전용 안전 게이트. `[상신]` 버튼 클릭 직전 이 함수로 한 번 더 차단.
export function canClickSubmit(env: NodeJS.ProcessEnv): boolean {
  return resolveMode(env) === 'live' && env.ERP_CONFIRM_SUBMIT === '1';
}
