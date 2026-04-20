import { describe, it, expect, beforeEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { createDb } from '../src/server/db/client';
import * as schema from '../src/server/db/schema';
import { CredentialVault } from '../src/server/vault/vault';

const KEY = Buffer.alloc(32, 7);

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

describe('CredentialVault', () => {
  let db: ReturnType<typeof createDb>;

  beforeEach(() => {
    db = createDb(':memory:');
  });

  it('encrypts, stores, and decrypts credentials round-trip', () => {
    const vault = new CredentialVault(db, KEY);
    const sessionId = seedSession(db);
    vault.save(sessionId, { userId: 'E2501', loginId: 'alice', password: 'p@ss!w0rd' });
    expect(vault.load(sessionId)).toEqual({
      userId: 'E2501',
      loginId: 'alice',
      password: 'p@ss!w0rd',
    });
  });

  it('produces different ciphertexts on each save (random IV)', () => {
    const vault = new CredentialVault(db, KEY);
    const sessionId = seedSession(db);

    vault.save(sessionId, { userId: 'E1', loginId: 'a', password: 'b' });
    const first = db
      .select()
      .from(schema.credentials)
      .where(eq(schema.credentials.sessionId, sessionId))
      .get();

    vault.save(sessionId, { userId: 'E1', loginId: 'a', password: 'b' });
    const second = db
      .select()
      .from(schema.credentials)
      .where(eq(schema.credentials.sessionId, sessionId))
      .get();

    expect(first).toBeDefined();
    expect(second).toBeDefined();
    expect(first!.iv).not.toEqual(second!.iv);
    expect(first!.loginIdCipher).not.toEqual(second!.loginIdCipher);
    expect(first!.passwordCipher).not.toEqual(second!.passwordCipher);
  });

  it('returns null when record missing', () => {
    const vault = new CredentialVault(db, KEY);
    expect(vault.load('does-not-exist')).toBeNull();
  });

  it('throws on wrong key (auth tag mismatch)', () => {
    const vaultA = new CredentialVault(db, KEY);
    const sessionId = seedSession(db);
    vaultA.save(sessionId, { userId: 'E1', loginId: 'a', password: 'b' });

    const vaultB = new CredentialVault(db, Buffer.alloc(32, 9));
    expect(() => vaultB.load(sessionId)).toThrow();
  });

  it('rejects a non-32-byte key at construction', () => {
    expect(() => new CredentialVault(db, Buffer.alloc(16))).toThrow();
  });

  it('uses independent IVs for loginId and password (no GCM nonce reuse)', () => {
    const vault = new CredentialVault(db, KEY);
    const sessionId = seedSession(db);
    vault.save(sessionId, { userId: 'E1', loginId: 'same', password: 'same' });

    const row = db
      .select()
      .from(schema.credentials)
      .where(eq(schema.credentials.sessionId, sessionId))
      .get();

    expect(row).toBeDefined();
    const ivBuf = Buffer.from(row!.iv, 'base64');
    const tagBuf = Buffer.from(row!.authTag, 'base64');
    expect(ivBuf.length).toBe(24); // 12 bytes × 2
    expect(tagBuf.length).toBe(32); // 16 bytes × 2
    expect(ivBuf.subarray(0, 12).equals(ivBuf.subarray(12))).toBe(false);
  });

  it('overwrites existing row on second save for the same sessionId', () => {
    const vault = new CredentialVault(db, KEY);
    const sessionId = seedSession(db);
    vault.save(sessionId, { userId: 'E1', loginId: 'old', password: 'old' });
    vault.save(sessionId, { userId: 'E1', loginId: 'new-id', password: 'new-pw' });
    expect(vault.load(sessionId)).toEqual({
      userId: 'E1',
      loginId: 'new-id',
      password: 'new-pw',
    });
  });
});
