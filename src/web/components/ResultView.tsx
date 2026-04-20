import { useState } from 'react';
import type { ViewProps } from '../../shared/protocol';
import { StatusBadge } from './StatusBadge';
import { InlineSpinner } from './InlineSpinner';
import { CredentialForm } from './CredentialForm';

// 4A 소유 · Plan B Task 11.
// room:state 단일 채널을 구독해 9 RoomStatus 전부를 단일 뷰로 처리 (ResultPage 없음).
// 본 컴포넌트는 FINISHED 이후 단계(CREDENTIAL_INPUT/QUEUED/RUNNING/COMPLETED/FAILED)
// 를 스위치한다. FINISHED 의 게임 결과 섹션은 3B Plan A 쪽에서 얹거나, 여기서 확장.
//
// prop 규약(공동 계약 lock): { snap, me } — snap/me 외 키 추가 금지.

const container: React.CSSProperties = {
  display: 'grid',
  gap: 'var(--space-4)',
  padding: 'var(--space-6)',
  background: 'var(--color-surface)',
  border: '1px solid var(--color-border)',
  borderRadius: 'var(--radius-lg)',
  boxShadow: 'var(--shadow-md)',
};

function formatScheduledAt(iso?: string): string {
  if (!iso) return '(예약 시각 미정)';
  try {
    const d = new Date(iso);
    return d.toLocaleString('ko-KR', {
      timeZone: 'Asia/Seoul',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  } catch {
    return iso;
  }
}

function Header({ snap }: Pick<ViewProps, 'snap'>) {
  return (
    <header
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 'var(--space-4)',
      }}
    >
      <h2 style={{ margin: 0, fontSize: '1.125rem' }}>결과 및 상신</h2>
      <StatusBadge status={snap.status} />
    </header>
  );
}

export function ResultView({ snap, me }: ViewProps) {
  const iAmLoser = snap.loserId === me;
  const [runBusy, setRunBusy] = useState(false);

  if (snap.status === 'FINISHED') {
    const loser = snap.players.find(p => p.id === snap.loserId);
    return (
      <section style={container} aria-label="결과">
        <Header snap={snap} />
        {snap.loserId ? (
          <div style={{ fontSize: 40, textAlign: 'center', margin: 'var(--space-6) 0' }}>
            💀 <strong>{loser?.name ?? snap.loserId ?? '???'}</strong>
          </div>
        ) : (
          <p style={{ margin: 0, color: 'var(--color-text-muted)' }}>패자 확정 대기 중…</p>
        )}
        {snap.results && snap.results.length > 0 && (
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 'var(--space-2)' }}>
            {snap.results.map(r => {
              const player = snap.players.find(p => p.id === r.playerId);
              return (
                <li key={r.playerId} style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>{player?.name ?? r.playerId}</span>
                  <strong>{r.value}점</strong>
                </li>
              );
            })}
          </ul>
        )}
        {iAmLoser && snap.loserId && (
          <CredentialForm sessionId={snap.sessionId} loserId={snap.loserId} />
        )}
        {!iAmLoser && snap.loserId && (
          <p style={{ margin: 0, color: 'var(--color-text-muted)', textAlign: 'center' }}>
            패자가 자격증명을 입력할 때까지 기다려주세요…
          </p>
        )}
      </section>
    );
  }

  if (snap.status === 'CREDENTIAL_INPUT') {
    return (
      <section style={container} aria-label="자격증명 입력">
        <Header snap={snap} />
        {iAmLoser && snap.loserId ? (
          <CredentialForm sessionId={snap.sessionId} loserId={snap.loserId} />
        ) : (
          <p style={{ margin: 0, color: 'var(--color-text-muted)' }}>
            패자(<code>{snap.loserId ?? '—'}</code>)가 자격증명을 입력하는 중입니다.
          </p>
        )}
      </section>
    );
  }

  if (snap.status === 'QUEUED') {
    return (
      <section style={container} aria-label="상신 예약됨">
        <Header snap={snap} />
        <p style={{ margin: 0 }}>
          상신이 예약되었습니다. 예약 시각:{' '}
          <strong>{formatScheduledAt(snap.scheduledAt)} (KST)</strong>
        </p>
        <p style={{ margin: 0, color: 'var(--color-text-muted)', fontSize: '0.875rem' }}>
          다음 영업일 09:00 KST 에 자동 실행됩니다. 창을 닫아도 진행 상황은 유지됩니다.
        </p>
        {iAmLoser && snap.submissionId && (
          <button
            onClick={async () => {
              setRunBusy(true);
              try {
                const res = await fetch(`/api/submissions/${snap.submissionId}/run-now`, {
                  method: 'POST',
                  headers: { 'X-Demo-Confirm': 'yes' },
                });
                if (!res.ok) alert(`실행 실패 (${res.status})`);
              } catch {
                alert('네트워크 오류');
              } finally {
                setRunBusy(false);
              }
            }}
            disabled={runBusy}
            style={{
              padding: 'var(--space-2) var(--space-4)',
              borderRadius: 'var(--radius-md)',
              border: 'none',
              background: 'var(--color-primary)',
              color: 'var(--color-primary-ink)',
              fontWeight: 700,
              cursor: 'pointer',
              fontSize: '0.875rem',
            }}
          >
            지금 상신 실행 (데모)
          </button>
        )}
      </section>
    );
  }

  if (snap.status === 'RUNNING') {
    return (
      <section style={container} aria-label="상신 진행 중">
        <Header snap={snap} />
        <InlineSpinner step={snap.workerStep ?? 'login'} />
        <p style={{ margin: 0, color: 'var(--color-text-muted)', fontSize: '0.875rem' }}>
          ERP 자동화 워커가 로그인 → 카드매칭 → 폼채움 → 결재상신 순으로 진행합니다.
        </p>
      </section>
    );
  }

  if (snap.status === 'COMPLETED') {
    return (
      <section style={container} aria-label="상신 완료">
        <Header snap={snap} />
        <p style={{ margin: 0 }}>
          상신이 완료되었습니다.{' '}
          {snap.erpRefNo && (
            <>
              ERP 접수번호: <code>{snap.erpRefNo}</code>
            </>
          )}
        </p>
      </section>
    );
  }

  if (snap.status === 'FAILED') {
    return (
      <section style={container} aria-label="상신 실패">
        <Header snap={snap} />
        <p style={{ margin: 0, color: 'var(--color-status-failed)' }}>
          상신 중 오류가 발생했습니다.
        </p>
        {snap.errorLog && (
          <pre
            style={{
              margin: 0,
              padding: 'var(--space-3)',
              background: 'var(--color-surface-raised)',
              borderRadius: 'var(--radius-sm)',
              fontSize: '0.75rem',
              color: 'var(--color-text-muted)',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
            }}
          >
            {snap.errorLog}
          </pre>
        )}
      </section>
    );
  }

  return null;
}
