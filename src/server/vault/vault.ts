import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import * as schema from '../db/schema';
import { encrypt, decrypt } from './crypto';
import type { ErpCredential } from './types';

// sessionId 에 대해 1:1. 기존 row 가 있으면 overwrite (onConflictDoUpdate).
// loginId / password 를 각각 독립 IV 로 암호화 — iv 컬럼에는 iv_L||iv_P (24B),
// auth_tag 컬럼에는 tag_L||tag_P (32B) 를 base64 로 연결 저장한다. 스키마 변경
// 없이 GCM 재-IV 원칙을 지키기 위한 패킹이다.

const IV_LEN = 12;
const TAG_LEN = 16;

export class CredentialVault {
  constructor(
    private db: BetterSQLite3Database<typeof schema>,
    private key: Buffer,
  ) {
    if (key.length !== 32) throw new Error('VAULT_MASTER_KEY must be 32 bytes');
  }

  save(sessionId: string, cred: ErpCredential): void {
    const loginEnc = encrypt(this.key, cred.loginId);
    const passEnc = encrypt(this.key, cred.password);
    const ivPacked = Buffer.concat([loginEnc.iv, passEnc.iv]).toString('base64');
    const tagPacked = Buffer.concat([loginEnc.authTag, passEnc.authTag]).toString('base64');
    const loginCipher = loginEnc.ciphertext.toString('base64');
    const passCipher = passEnc.ciphertext.toString('base64');
    const now = new Date();

    this.db
      .insert(schema.credentials)
      .values({
        id: randomUUID(),
        sessionId,
        userId: cred.userId,
        loginIdCipher: loginCipher,
        passwordCipher: passCipher,
        iv: ivPacked,
        authTag: tagPacked,
        createdAt: now,
      })
      .onConflictDoUpdate({
        target: schema.credentials.sessionId,
        set: {
          userId: cred.userId,
          loginIdCipher: loginCipher,
          passwordCipher: passCipher,
          iv: ivPacked,
          authTag: tagPacked,
        },
      })
      .run();
  }

  load(sessionId: string): ErpCredential | null {
    const row = this.db
      .select()
      .from(schema.credentials)
      .where(eq(schema.credentials.sessionId, sessionId))
      .get();
    if (!row) return null;

    const ivBuf = Buffer.from(row.iv, 'base64');
    const tagBuf = Buffer.from(row.authTag, 'base64');
    if (ivBuf.length !== IV_LEN * 2) throw new Error('corrupt iv length');
    if (tagBuf.length !== TAG_LEN * 2) throw new Error('corrupt authTag length');

    const loginId = decrypt(
      this.key,
      Buffer.from(row.loginIdCipher, 'base64'),
      ivBuf.subarray(0, IV_LEN),
      tagBuf.subarray(0, TAG_LEN),
    );
    const password = decrypt(
      this.key,
      Buffer.from(row.passwordCipher, 'base64'),
      ivBuf.subarray(IV_LEN),
      tagBuf.subarray(TAG_LEN),
    );

    return { userId: row.userId, loginId, password };
  }

  delete(sessionId: string): void {
    this.db.delete(schema.credentials).where(eq(schema.credentials.sessionId, sessionId)).run();
  }
}
