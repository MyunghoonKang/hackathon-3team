import { useState, type FormEvent } from 'react';
import { CREDENTIAL_FIELD_RULES } from '../../shared/protocol';

// 4A 소유. Plan B Task 3 본문.
// ResultView 가 FINISHED 단계에서 snap.sessionId · snap.loserId 를 추출해
// 아래 props 로 넘긴다 (ViewProps 전체를 넘기지 않음 — 폼은 읽기 전용 영역을 몰라도 됨).
//
// 흐름:
//   1) POST /api/credentials  (vault AES-256-GCM 저장, 204)
//   2) POST /api/sessions/:sessionId/submissions
//      → 서버가 CREDENTIAL_INPUT → QUEUED 전이 + broadcastRoomState
//      → 모든 탭의 RoomPage 가 room:state 수신 후 QUEUED 뷰로 자동 전환
// navigation 없음. 성공 시 폼은 다음 room:state 가 내려오면서 언마운트됨.
export interface CredentialFormProps {
  sessionId: string;
  loserId: string;
}

export function CredentialForm({ sessionId, loserId }: CredentialFormProps) {
  const [userId, setUserId] = useState('');
  const [loginId, setLoginId] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const saveRes = await fetch('/api/credentials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, userId, loginId, password }),
      });
      if (!saveRes.ok) {
        const text = await saveRes.text();
        throw new Error(`자격증명 저장 실패 (${saveRes.status}): ${text}`);
      }

      const enqueue = await fetch(`/api/sessions/${sessionId}/submissions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ loserId }),
      });
      if (!enqueue.ok) {
        const text = await enqueue.text();
        throw new Error(`상신 예약 실패 (${enqueue.status}): ${text}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      className="credential-form"
      aria-busy={busy}
      style={{
        display: 'grid',
        gap: 'var(--space-4)',
        padding: 'var(--space-6)',
        background: 'var(--color-surface)',
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-lg)',
        boxShadow: 'var(--shadow-md)',
      }}
    >
      <header style={{ display: 'grid', gap: 'var(--space-2)' }}>
        <h2 style={{ margin: 0 }}>ERP 자격증명 입력 (패자)</h2>
        <p style={{ margin: 0, color: 'var(--color-text-muted)', fontSize: '0.875rem' }}>
          회사코드 <code>meissa</code> 는 자동 입력됩니다. 사번 · ID · PW 만 입력해주세요.
          저장된 자격증명은 AES-256-GCM 으로 암호화되며 상신 완료 후 폐기됩니다.
        </p>
      </header>

      <label style={{ display: 'grid', gap: 'var(--space-1)' }}>
        <span>사번 (userId)</span>
        <input
          name="userId"
          value={userId}
          onChange={(e) => setUserId(e.target.value)}
          autoComplete="off"
          maxLength={CREDENTIAL_FIELD_RULES.userId.maxLength}
          required
          disabled={busy}
        />
      </label>

      <label style={{ display: 'grid', gap: 'var(--space-1)' }}>
        <span>로그인 ID</span>
        <input
          name="loginId"
          value={loginId}
          onChange={(e) => setLoginId(e.target.value)}
          autoComplete="off"
          maxLength={CREDENTIAL_FIELD_RULES.loginId.maxLength}
          required
          disabled={busy}
        />
      </label>

      <label style={{ display: 'grid', gap: 'var(--space-1)' }}>
        <span>비밀번호</span>
        <input
          name="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="new-password"
          maxLength={CREDENTIAL_FIELD_RULES.password.maxLength}
          required
          disabled={busy}
        />
      </label>

      {error && (
        <p role="alert" style={{ margin: 0, color: 'var(--color-status-failed)' }}>
          {error}
        </p>
      )}

      <footer style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
          패자 userId: <code>{loserId}</code>
        </span>
        <button
          type="submit"
          disabled={busy}
          style={{
            padding: 'var(--space-2) var(--space-6)',
            borderRadius: 'var(--radius-md)',
            border: 'none',
            background: 'var(--color-primary)',
            color: 'var(--color-primary-ink)',
            fontWeight: 700,
            cursor: busy ? 'wait' : 'pointer',
          }}
        >
          {busy ? '저장 중…' : '저장하고 상신 예약'}
        </button>
      </footer>
    </form>
  );
}
