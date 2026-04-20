import { Router } from 'express';
import type { CredentialVault } from '../vault/vault';
import { createCredentialRequestSchema } from '../../shared/protocol';

// POST /api/credentials  body: { sessionId, userId, loginId, password }
//   → 204 (vault 에 AES-256-GCM 암호화 저장)
//   → 400 (zod 검증 실패)
//
// 주의: `POST /api/sessions/:id/credential-input` (FINISHED → CREDENTIAL_INPUT
// 전이 + broadcastRoomState) 는 SessionManager (3A A5) · io 인스턴스가 필요하다.
// A5 머지 후 submissions.ts (B11) 라우터에 함께 추가할 예정.
export function credentialsRouter(vault: CredentialVault): Router {
  const r = Router();

  r.post('/', (req, res) => {
    const parsed = createCredentialRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    const { sessionId, userId, loginId, password } = parsed.data;
    try {
      vault.save(sessionId, { userId, loginId, password });
    } catch (e) {
      // sessionId FK 불일치(세션 없음) 는 409 로 회신 — 프론트가 세션 재진입을 유도
      if (e instanceof Error && /FOREIGN KEY/i.test(e.message)) {
        res.status(409).json({ error: 'session_not_found' });
        return;
      }
      throw e;
    }
    res.status(204).end();
  });

  return r;
}
