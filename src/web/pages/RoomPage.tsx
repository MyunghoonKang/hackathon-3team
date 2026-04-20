import { useParams } from 'react-router-dom';
import { useSession } from '../hooks/useSession';
import { LobbyView } from '../components/LobbyView';
import { ResultView } from '../components/ResultView';

export default function RoomPage() {
  const { code } = useParams();
  const { session, me } = useSession();

  const roomCode = code?.toUpperCase() ?? session?.roomCode ?? '----';

  if (!session) {
    return (
      <main className="room">
        <header className="room__header">
          <span className="room__code-label">룸 코드</span>
          <span className="room__code">{roomCode}</span>
        </header>
        <p className="room__loading">방 정보 로딩 중…</p>
      </main>
    );
  }

  const { status, players } = session;

  // Plan B: FINISHED 이후 단계 — ResultView(4A 소유)가 6 case 전부 처리
  if (
    status === 'FINISHED' ||
    status === 'CREDENTIAL_INPUT' ||
    status === 'QUEUED' ||
    status === 'RUNNING' ||
    status === 'COMPLETED' ||
    status === 'FAILED'
  ) {
    return (
      <main className="room">
        <header className="room__header">
          <span className="room__code-label">룸 코드</span>
          <span className="room__code">{roomCode}</span>
        </header>
        <ResultView snap={session} me={me ?? ''} />
      </main>
    );
  }

  if (status === 'ABORTED') {
    return (
      <main className="room">
        <header className="room__header">
          <span className="room__code-label">룸 코드</span>
          <span className="room__code">{roomCode}</span>
        </header>
        <p style={{ textAlign: 'center', color: 'var(--color-text-muted)', marginTop: 'var(--space-8)' }}>
          세션이 중단되었습니다.
        </p>
      </main>
    );
  }

  // PREPARING — LobbyView (A11). me 없으면 fallthrough.
  if (status === 'PREPARING' && me) {
    return (
      <main className="room">
        <LobbyView snap={session} me={me} />
      </main>
    );
  }

  // PLAYING / 기타 — A12(GameView) 머지 전 임시 플레이어 목록
  return (
    <main className="room">
      <header className="room__header">
        <span className="room__code-label">룸 코드</span>
        <span className="room__code">{roomCode}</span>
      </header>
      <section className="room__summary">
        <p>
          참가자 <strong>{players.length}명</strong> · 상태 {status}
        </p>
        <ul className="room__players">
          {players.map((p) => (
            <li key={p.id}>
              {p.name}
              {p.isHost ? ' 👑' : ''}
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
