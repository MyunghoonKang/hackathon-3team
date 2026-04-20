import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Server as IOServer } from 'socket.io';
import { SessionManager, IllegalTransitionError, SessionNotFoundError } from '../src/server/session/manager';
import {
  createSubmissionHook,
  registerSubmissionHook,
  resetSubmissionHookForTests,
  onGameFinished,
} from '../src/server/hooks/submissionHook';
import { SOCKET_EVENT_ROOM_STATE } from '../src/shared/protocol';

// 최소한의 io stub — broadcastRoomState 가 io.to(sessionId).emit(event, snap) 호출.
function makeIoStub() {
  const emit = vi.fn();
  const to = vi.fn(() => ({ emit }));
  return { io: { to } as unknown as IOServer, emit, to };
}

function bringToFinished(mgr: SessionManager) {
  const snap = mgr.createSession({ name: 'Alice' });
  const joined = mgr.join({ roomCode: snap.roomCode, name: 'Bob' });
  mgr.selectGame({ sessionId: snap.id, actorId: snap.hostId, gameId: 'g1' });
  mgr.startGame({ sessionId: snap.id, actorId: snap.hostId });
  const bobId = joined.players[1]!.id;
  mgr.finishGame({
    sessionId: snap.id,
    loserId: bobId,
    results: [
      { playerId: snap.hostId, value: 1 },
      { playerId: bobId, value: 9 },
    ],
  });
  return { sessionId: snap.id, loserId: bobId };
}

describe('createSubmissionHook · B12', () => {
  let mgr: SessionManager;
  beforeEach(() => {
    mgr = new SessionManager({ persist: false });
  });

  it('FINISHED → CREDENTIAL_INPUT 전이 + broadcast', async () => {
    const { io, emit, to } = makeIoStub();
    const hook = createSubmissionHook({ mgr, io });
    const { sessionId, loserId } = bringToFinished(mgr);

    await hook(sessionId, loserId);

    const snap = mgr.getById(sessionId);
    expect(snap?.status).toBe('CREDENTIAL_INPUT');
    expect(snap?.loserId).toBe(loserId);
    expect(to).toHaveBeenCalledWith(sessionId);
    expect(emit).toHaveBeenCalledWith(SOCKET_EVENT_ROOM_STATE, expect.objectContaining({
      sessionId,
      status: 'CREDENTIAL_INPUT',
      loserId,
    }));
  });

  it('io=null 이면 broadcast 없이 전이만 수행', async () => {
    const hook = createSubmissionHook({ mgr, io: null });
    const { sessionId, loserId } = bringToFinished(mgr);

    await hook(sessionId, loserId);

    expect(mgr.getById(sessionId)?.status).toBe('CREDENTIAL_INPUT');
  });

  it('PREPARING 상태에서 호출하면 IllegalTransitionError', async () => {
    const hook = createSubmissionHook({ mgr, io: null });
    const snap = mgr.createSession({ name: 'Alice' });
    await expect(hook(snap.id, snap.hostId)).rejects.toBeInstanceOf(IllegalTransitionError);
  });

  it('알 수 없는 sessionId 면 SessionNotFoundError', async () => {
    const hook = createSubmissionHook({ mgr, io: null });
    await expect(hook('nope', 'anyone')).rejects.toBeInstanceOf(SessionNotFoundError);
  });
});

describe('module-level onGameFinished · register/reset 라이프사이클', () => {
  beforeEach(() => {
    resetSubmissionHookForTests();
  });

  it('등록 전엔 no-op (warn 만, throw 없음)', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await expect(onGameFinished('s1', 'p1')).resolves.toBeUndefined();
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('registerSubmissionHook 후엔 등록된 deps 로 실 전이', async () => {
    const mgr = new SessionManager({ persist: false });
    const { io, emit } = makeIoStub();
    registerSubmissionHook({ mgr, io });
    const { sessionId, loserId } = bringToFinished(mgr);

    await onGameFinished(sessionId, loserId);

    expect(mgr.getById(sessionId)?.status).toBe('CREDENTIAL_INPUT');
    expect(emit).toHaveBeenCalledWith(SOCKET_EVENT_ROOM_STATE, expect.objectContaining({
      status: 'CREDENTIAL_INPUT',
    }));
  });
});
