import { randomInt } from 'node:crypto';

const ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // O, 0, 1, I 제외 (혼동 방지)

export function isRoomCode(value: string): boolean {
  return /^[A-Z0-9]{4}$/.test(value);
}

export function generateRoomCode(excluded?: ReadonlySet<string>): string {
  // 1,048,576 조합 (32^4) — 충돌 확률 매우 낮으나 재시도 로직 포함
  for (let attempt = 0; attempt < 50; attempt++) {
    let code = '';
    for (let i = 0; i < 4; i++) code += ALPHA[randomInt(ALPHA.length)]!;
    if (!excluded?.has(code)) return code;
  }
  throw new Error('roomCode: exhausted attempts');
}
