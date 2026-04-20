import { describe, it, expect } from 'vitest';
import { generateRoomCode, isRoomCode } from '../src/server/session/roomCode';

describe('roomCode', () => {
  it('generates 4-char alphanumeric uppercase', () => {
    const code = generateRoomCode();
    expect(code).toMatch(/^[A-Z0-9]{4}$/);
  });
  it('isRoomCode validates format', () => {
    expect(isRoomCode('AB12')).toBe(true);
    expect(isRoomCode('ab12')).toBe(false);
    expect(isRoomCode('ABCDE')).toBe(false);
  });
  it('generates uniqueRoomCode excluding existing set', () => {
    // 10,000 codes — must never collide with a pre-existing set of 1000
    const existing = new Set<string>();
    for (let i = 0; i < 1000; i++) existing.add(generateRoomCode());
    for (let i = 0; i < 100; i++) {
      const c = generateRoomCode(existing);
      expect(existing.has(c)).toBe(false);
      existing.add(c);
    }
  });
});
