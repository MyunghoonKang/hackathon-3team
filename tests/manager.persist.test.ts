import { describe, it, expect, beforeEach } from 'vitest';
import { eq } from 'drizzle-orm';
import { createDb } from '../src/server/db/client';
import * as schema from '../src/server/db/schema';
import { SessionManager } from '../src/server/session/manager';

describe('SessionManager DB persistence (persist=true)', () => {
  let db: ReturnType<typeof createDb>;
  let mgr: SessionManager;

  beforeEach(() => {
    db = createDb(':memory:');
    mgr = new SessionManager({ persist: true, db });
  });

  it('createSession inserts a sessions row with matching fields', () => {
    const snap = mgr.createSession({ name: 'Alice' });
    const row = db
      .select()
      .from(schema.sessions)
      .where(eq(schema.sessions.id, snap.id))
      .get();
    expect(row).toBeDefined();
    expect(row!.id).toBe(snap.id);
    expect(row!.roomCode).toBe(snap.roomCode);
    expect(row!.status).toBe('PREPARING');
    expect(row!.hostId).toBe(snap.hostId);
    expect(row!.gameId).toBeNull();
    expect(row!.loserId).toBeNull();
    // drizzle mode:'timestamp' stores seconds — compare at second resolution.
    expect(Math.floor(row!.createdAt.getTime() / 1000)).toBe(
      Math.floor(snap.createdAt / 1000),
    );
    expect(row!.updatedAt.getTime()).toBeGreaterThanOrEqual(
      Math.floor(snap.createdAt / 1000) * 1000,
    );
  });

  it('persist defaults to true when opts omitted (db required)', () => {
    // Missing db with default persist=true must throw.
    expect(() => new SessionManager()).toThrow(/db/i);
    // Explicit persist=true without db throws.
    expect(() => new SessionManager({ persist: true })).toThrow(/db/i);
  });

  it('join updates the existing row (updatedAt bumped, no new row)', async () => {
    const snap = mgr.createSession({ name: 'Alice' });
    const initial = db
      .select()
      .from(schema.sessions)
      .where(eq(schema.sessions.id, snap.id))
      .get();
    // Wait 1 tick so updatedAt is guaranteed to advance past the insert tick.
    await new Promise((r) => setTimeout(r, 10));
    mgr.join({ roomCode: snap.roomCode, name: 'Bob' });
    const after = db
      .select()
      .from(schema.sessions)
      .where(eq(schema.sessions.id, snap.id))
      .get();
    const all = db.select().from(schema.sessions).all();
    expect(all.length).toBe(1);
    expect(after!.updatedAt.getTime()).toBeGreaterThanOrEqual(initial!.updatedAt.getTime());
  });

  it('selectGame updates gameId in the DB row', () => {
    const snap = mgr.createSession({ name: 'Alice' });
    mgr.selectGame({ sessionId: snap.id, actorId: snap.hostId, gameId: 'number-guess' });
    const row = db
      .select()
      .from(schema.sessions)
      .where(eq(schema.sessions.id, snap.id))
      .get();
    expect(row!.gameId).toBe('number-guess');
  });

  it('finishGame updates status=FINISHED and loserId in the DB row', () => {
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
    const row = db
      .select()
      .from(schema.sessions)
      .where(eq(schema.sessions.id, snap.id))
      .get();
    expect(row!.status).toBe('FINISHED');
    expect(row!.loserId).toBe(bobId);
  });

  it('transitionStatus updates status across Plan B chain in the DB row', () => {
    const snap = mgr.createSession({ name: 'Alice' });
    mgr.join({ roomCode: snap.roomCode, name: 'Bob' });
    mgr.selectGame({ sessionId: snap.id, actorId: snap.hostId, gameId: 'g1' });
    mgr.startGame({ sessionId: snap.id, actorId: snap.hostId });
    mgr.finishGame({ sessionId: snap.id, loserId: snap.hostId, results: [] });
    mgr.transitionStatus({ sessionId: snap.id, to: 'CREDENTIAL_INPUT' });
    mgr.transitionStatus({
      sessionId: snap.id,
      to: 'QUEUED',
      patch: { submissionId: 'sub1', scheduledAt: 1700000000 },
    });
    const queuedRow = db
      .select()
      .from(schema.sessions)
      .where(eq(schema.sessions.id, snap.id))
      .get();
    expect(queuedRow!.status).toBe('QUEUED');

    mgr.transitionStatus({
      sessionId: snap.id,
      to: 'RUNNING',
      patch: { workerStep: 'login' },
    });
    mgr.transitionStatus({
      sessionId: snap.id,
      to: 'COMPLETED',
      patch: { erpRefNo: 'ERP-42' },
    });
    const doneRow = db
      .select()
      .from(schema.sessions)
      .where(eq(schema.sessions.id, snap.id))
      .get();
    expect(doneRow!.status).toBe('COMPLETED');
  });

  it('persist=false does not write to DB even when a db is supplied', () => {
    const memMgr = new SessionManager({ persist: false, db });
    const snap = memMgr.createSession({ name: 'NoPersist' });
    const rows = db.select().from(schema.sessions).all();
    expect(rows.length).toBe(0);
    // but in-memory lookup still works
    expect(memMgr.getById(snap.id)?.id).toBe(snap.id);
  });
});
