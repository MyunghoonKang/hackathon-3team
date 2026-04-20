import type { Server as IOServer } from 'socket.io';
import { SOCKET_EVENT_ROOM_STATE, type RoomStatePayload } from '../shared/protocol';

// 공동 계약: 모든 RoomStatus 전이는 mgr.transitionStatus() 직후 이 유틸로 broadcast.
// 채널 'room:state' 단일 — 다른 이벤트명 추가 금지.
// io=null 허용 (테스트/서버 미기동 시 no-op). 프로덕션은 index.ts 에서 주입.
export function broadcastRoomState(
  io: IOServer | null,
  snap: RoomStatePayload,
): void {
  if (!io) return;
  io.to(snap.sessionId).emit(SOCKET_EVENT_ROOM_STATE, snap);
}
