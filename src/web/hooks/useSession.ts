import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { socket } from '../socket';
import { SOCKET_EVENT_ROOM_STATE, type RoomStatePayload } from '../../shared/protocol';

// 이전 run 의 치명 버그 (HomePage→RoomPage navigate 직후 session 이 null 로 증발) 방지 —
// session · me 는 컴포넌트 state 가 아니라 모듈 레벨 store 에 둔다.
let _session: RoomStatePayload | null = null;
let _me: string | null = null;
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}
function subscribe(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}
function getSession() {
  return _session;
}
function getMe() {
  return _me;
}

function replaceSession(next: RoomStatePayload | null) {
  _session = next;
  emit();
}
function replaceMe(next: string | null) {
  _me = next;
  emit();
}

// 서버 ack 응답을 한 번의 지점에서 RoomStatePayload 로 정규화 — 네이밍 drift 방지.
function toPayload(raw: unknown): RoomStatePayload | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Partial<RoomStatePayload> & { id?: string };
  const sessionId = r.sessionId ?? r.id;
  if (!sessionId || !r.roomCode || !r.status || !Array.isArray(r.players) || !r.hostId) return null;
  return { ...(r as RoomStatePayload), sessionId };
}

let wired = false;
function ensureWired() {
  if (wired) return;
  wired = true;
  socket.on(SOCKET_EVENT_ROOM_STATE, (raw: unknown) => {
    const snap = toPayload(raw);
    if (snap) replaceSession(snap);
  });
  if (!socket.connected) socket.connect();
}

export interface CreateAck {
  error?: string;
  session?: unknown;
}
export interface JoinAck {
  error?: string;
  session?: unknown;
  playerId?: string;
}

export function useSession() {
  const session = useSyncExternalStore(subscribe, getSession, getSession);
  const me = useSyncExternalStore(subscribe, getMe, getMe);

  useEffect(() => {
    ensureWired();
  }, []);

  const create = useCallback(async (hostName: string): Promise<RoomStatePayload> => {
    return new Promise((resolve, reject) => {
      socket.emit('session:create', { hostName }, (ack: CreateAck) => {
        const snap = toPayload(ack?.session);
        if (ack?.error || !snap) return reject(new Error(ack?.error ?? 'create failed'));
        replaceSession(snap);
        replaceMe(snap.hostId);
        resolve(snap);
      });
    });
  }, []);

  const join = useCallback(
    async (roomCode: string, name: string): Promise<{ snap: RoomStatePayload; playerId: string }> => {
      return new Promise((resolve, reject) => {
        socket.emit('session:join', { roomCode, name }, (ack: JoinAck) => {
          const snap = toPayload(ack?.session);
          if (ack?.error || !snap || !ack?.playerId)
            return reject(new Error(ack?.error ?? 'join failed'));
          replaceSession(snap);
          replaceMe(ack.playerId);
          resolve({ snap, playerId: ack.playerId });
        });
      });
    },
    [],
  );

  return { session, me, create, join };
}
