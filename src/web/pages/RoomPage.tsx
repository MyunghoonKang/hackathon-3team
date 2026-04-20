import { useParams } from 'react-router-dom';
import { useSession } from '../hooks/useSession';

// A10 스코프의 최소 스텁. LobbyView(A11) · GameView(A12) · ResultView(A13) 는 후속 Task 에서
// switch(status) 로 스왑한다. 지금은 session 없으면 "로딩", 있으면 요약만.
export default function RoomPage() {
  const { code } = useParams();
  const { session } = useSession();

  return (
    <main className="room">
      <header className="room__header">
        <span className="room__code-label">룸 코드</span>
        <span className="room__code">{code?.toUpperCase() ?? '----'}</span>
      </header>

      {session ? (
        <section className="room__summary">
          <p>
            참가자 <strong>{session.players.length}명</strong> · 상태 {session.status}
          </p>
          <ul className="room__players">
            {session.players.map((p) => (
              <li key={p.id}>
                {p.name}
                {p.isHost ? ' 👑' : ''}
              </li>
            ))}
          </ul>
        </section>
      ) : (
        <p className="room__loading">방 정보 로딩 중…</p>
      )}
    </main>
  );
}
