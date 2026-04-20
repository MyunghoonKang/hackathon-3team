import { describe, it, expect, beforeEach } from 'vitest';
import { SessionManager } from '../src/server/session/manager';

describe('SessionManager', () => {
  let mgr: SessionManager;
  beforeEach(() => { mgr = new SessionManager({ persist: false }); });

  it('create session returns snapshot with unique room code', () => {
    const a = mgr.createSession({ name: 'Alice' });
    const b = mgr.createSession({ name: 'Bob' });
    expect(a.roomCode).not.toBe(b.roomCode);
    expect(a.hostId).toBe(a.players[0]!.id);
    expect(a.status).toBe('PREPARING');
  });

  it('join session appends participant', () => {
    const a = mgr.createSession({ name: 'Alice' });
    const joined = mgr.join({ roomCode: a.roomCode, name: 'Bob' });
    expect(joined.players.length).toBe(2);
    expect(joined.players[1]!.name).toBe('Bob');
  });

  it('join with unknown code throws', () => {
    expect(() => mgr.join({ roomCode: 'ZZZZ', name: 'X' })).toThrow(/not found/i);
  });

  it('selectGame stores gameId, host-only', () => {
    const a = mgr.createSession({ name: 'Alice' });
    const b = mgr.join({ roomCode: a.roomCode, name: 'Bob' });
    mgr.selectGame({ sessionId: a.id, actorId: a.hostId, gameId: 'g1' });
    expect(mgr.getById(a.id)?.selectedGameId).toBe('g1');
    expect(() => mgr.selectGame({ sessionId: a.id, actorId: b.players[1]!.id, gameId: 'g2' }))
      .toThrow(/host only/i);
  });

  it('startGame transitions PREPARING → PLAYING, host-only', () => {
    const a = mgr.createSession({ name: 'Alice' });
    mgr.join({ roomCode: a.roomCode, name: 'Bob' });
    mgr.selectGame({ sessionId: a.id, actorId: a.hostId, gameId: 'g1' });
    const started = mgr.startGame({ sessionId: a.id, actorId: a.hostId });
    expect(started.status).toBe('PLAYING');
    expect(started.startedAt).toBeGreaterThan(0);
  });

  it('finishGame transitions PLAYING → FINISHED, captures loser/results', () => {
    const a = mgr.createSession({ name: 'Alice' });
    const j = mgr.join({ roomCode: a.roomCode, name: 'Bob' });
    mgr.selectGame({ sessionId: a.id, actorId: a.hostId, gameId: 'g1' });
    mgr.startGame({ sessionId: a.id, actorId: a.hostId });
    const bobId = j.players[1]!.id;
    const done = mgr.finishGame({
      sessionId: a.id,
      loserId: bobId,
      results: [{ playerId: a.hostId, value: 1 }, { playerId: bobId, value: 9 }],
    });
    expect(done.status).toBe('FINISHED');
    expect(done.loserId).toBe(bobId);
  });

  it('transitionStatus enforces FINISHED → CREDENTIAL_INPUT → QUEUED → RUNNING → COMPLETED chain', () => {
    const a = mgr.createSession({ name: 'Alice' });
    mgr.join({ roomCode: a.roomCode, name: 'Bob' });
    mgr.selectGame({ sessionId: a.id, actorId: a.hostId, gameId: 'g1' });
    mgr.startGame({ sessionId: a.id, actorId: a.hostId });
    mgr.finishGame({ sessionId: a.id, loserId: a.hostId, results: [] });
    expect(mgr.transitionStatus({ sessionId: a.id, to: 'CREDENTIAL_INPUT' }).status).toBe('CREDENTIAL_INPUT');
    expect(mgr.transitionStatus({ sessionId: a.id, to: 'QUEUED', patch: { submissionId: 'sub1', scheduledAt: 123 } }).status).toBe('QUEUED');
    expect(mgr.transitionStatus({ sessionId: a.id, to: 'RUNNING', patch: { workerStep: 'login' } }).status).toBe('RUNNING');
    expect(mgr.transitionStatus({ sessionId: a.id, to: 'COMPLETED', patch: { erpRefNo: 'EX-1' } }).erpRefNo).toBe('EX-1');
  });

  it('transitionStatus rejects illegal jumps (e.g., PREPARING → COMPLETED)', () => {
    const a = mgr.createSession({ name: 'Alice' });
    expect(() => mgr.transitionStatus({ sessionId: a.id, to: 'COMPLETED' })).toThrow(/illegal transition/i);
  });

  it('getById returns a clone; mutations do not affect internal state', () => {
    const a = mgr.createSession({ name: 'Alice' });
    const snap = mgr.getById(a.id);
    expect(snap).toBeDefined();
    (snap as any).status = 'ABORTED';
    const fresh = mgr.getById(a.id);
    expect(fresh?.status).toBe('PREPARING');
  });

  it('join rejects non-PREPARING sessions', () => {
    const a = mgr.createSession({ name: 'Alice' });
    mgr.join({ roomCode: a.roomCode, name: 'Bob' });
    mgr.selectGame({ sessionId: a.id, actorId: a.hostId, gameId: 'g1' });
    mgr.startGame({ sessionId: a.id, actorId: a.hostId });
    expect(() => mgr.join({ roomCode: a.roomCode, name: 'Charlie' }))
      .toThrow(/already started|not in PREPARING|status/i);
  });
});
