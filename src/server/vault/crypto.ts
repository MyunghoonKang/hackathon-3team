import { randomBytes, createCipheriv, createDecipheriv } from 'node:crypto';

// AES-256-GCM · 12-byte IV · 16-byte auth tag.
// GCM 은 동일 키에서 IV 재사용 시 기밀성이 깨지므로 save 마다 randomBytes(12)
// 로 새 IV 를 생성한다. loginId / password 각각 독립 IV 를 갖는다.

const ALGO = 'aes-256-gcm';
const IV_LEN = 12;

export interface EncryptedBlob {
  ciphertext: Buffer;
  iv: Buffer;
  authTag: Buffer;
}

export function encrypt(key: Buffer, plaintext: string): EncryptedBlob {
  if (key.length !== 32) throw new Error('key must be 32 bytes (AES-256)');
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGO, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return { ciphertext, iv, authTag: cipher.getAuthTag() };
}

export function decrypt(key: Buffer, ciphertext: Buffer, iv: Buffer, authTag: Buffer): string {
  if (key.length !== 32) throw new Error('key must be 32 bytes (AES-256)');
  const decipher = createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(authTag);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return plaintext.toString('utf8');
}
