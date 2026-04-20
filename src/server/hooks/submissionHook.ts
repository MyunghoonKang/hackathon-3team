// 공동 계약 (H+0~2) · Plan A GameRunner → Plan B enqueue 결합 지점
// 시그니처 고정 · 4A 가 B12 에서 실 구현으로 교체한다.
// 3A 는 GameRunner outcome 확정 직후 이 함수만 호출 (다른 경로 금지).

export async function onGameFinished(
  sessionId: string,
  loserId: string,
): Promise<void> {
  // 공동 계약 단계 no-op · 4A B12 가 대체:
  // 1) FINISHED → CREDENTIAL_INPUT 전이 (mgr.transitionStatus)
  // 2) broadcastRoomState(io, snap)
  // 3) 로그인 폼 진입 유도 (UI 는 room:state 수신으로 자동 전환)
  void sessionId;
  void loserId;
}
