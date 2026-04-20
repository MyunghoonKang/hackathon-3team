import { describe, it, expect, beforeEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { buildApp } from '../src/server/app';
import { createDb } from '../src/server/db/client';
import * as schema from '../src/server/db/schema';

const KEY = Buffer.alloc(32, 1);

function seedSession(db: ReturnType<typeof createDb>): string {
  const sessionId = randomUUID();
  const now = new Date();
  db.insert(schema.sessions)
    .values({
      id: sessionId,
      roomCode: sessionId.slice(0, 4).toUpperCase(),
      status: 'CREDENTIAL_INPUT',
      hostId: 'host-1',
      createdAt: now,
      updatedAt: now,
    })
    .run();
  return sessionId;
}

describe('POST /api/credentials', () => {
  let built: ReturnType<typeof buildApp>;

  beforeEach(() => {
    const db = createDb(':memory:');
    built = buildApp({ vaultKey: KEY, db });
  });

  it('stores credentials (AES-256-GCM) and returns 204', async () => {
    const sessionId = seedSession(built.db);
    const res = await request(built.app)
      .post('/api/credentials')
      .send({ sessionId, userId: 'E2501', loginId: 'alice', password: 's3cret' });

    expect(res.status).toBe(204);
    expect(built.vault.load(sessionId)).toEqual({
      userId: 'E2501',
      loginId: 'alice',
      password: 's3cret',
    });
  });

  it('overwrites prior credentials on repeat save (same sessionId)', async () => {
    const sessionId = seedSession(built.db);
    await request(built.app)
      .post('/api/credentials')
      .send({ sessionId, userId: 'E1', loginId: 'old', password: 'old-pw' });
    const res = await request(built.app)
      .post('/api/credentials')
      .send({ sessionId, userId: 'E1', loginId: 'new', password: 'new-pw' });

    expect(res.status).toBe(204);
    expect(built.vault.load(sessionId)).toEqual({
      userId: 'E1',
      loginId: 'new',
      password: 'new-pw',
    });
  });

  it('returns 400 on empty body', async () => {
    const res = await request(built.app).post('/api/credentials').send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
  });

  it('returns 400 when a field is empty string', async () => {
    const sessionId = seedSession(built.db);
    const res = await request(built.app)
      .post('/api/credentials')
      .send({ sessionId, userId: '', loginId: 'a', password: 'b' });
    expect(res.status).toBe(400);
  });

  it('returns 400 when password exceeds max length', async () => {
    const sessionId = seedSession(built.db);
    const res = await request(built.app)
      .post('/api/credentials')
      .send({
        sessionId,
        userId: 'E1',
        loginId: 'alice',
        password: 'x'.repeat(129),
      });
    expect(res.status).toBe(400);
  });

  it('returns 409 when sessionId does not exist (FK)', async () => {
    const res = await request(built.app)
      .post('/api/credentials')
      .send({
        sessionId: 'non-existent-uuid',
        userId: 'E1',
        loginId: 'a',
        password: 'b',
      });
    expect(res.status).toBe(409);
  });
});
