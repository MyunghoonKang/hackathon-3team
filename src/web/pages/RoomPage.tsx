import { useParams } from 'react-router-dom';
import { useSession } from '../hooks/useSession';
import { LobbyView } from '../components/LobbyView';

// RoomPage 는 RoomStatus 에 따라 내부 뷰를 스왑한다.
// A11: PREPARING 만 구현. A12/A13 에서 PLAYING/FINISHED · 그 이후 5 case(Plan B) 추가.
// 스위치는 default(null) 로 두어 확장에 열려있음 — fallthrough 금지.
export default function RoomPage() {
  const { code } = useParams();
  const { session, me } = useSession();

  if (!session || !me) {
    return (
      <main className="room">
        <header className="room__header">
          <span className="room__code-label">룸 코드</span>
          <span className="room__code">{code?.toUpperCase() ?? '----'}</span>
        </header>
        <p className="room__loading">방 정보 로딩 중…</p>
      </main>
    );
  }

  switch (session.status) {
    case 'PREPARING':
      return (
        <main className="room">
          <LobbyView snap={session} me={me} />
        </main>
      );
    default:
      return (
        <main className="room">
          <header className="room__header">
            <span className="room__code-label">룸 코드</span>
            <span className="room__code">{session.roomCode}</span>
          </header>
          <p className="room__loading">
            상태 {session.status} · 해당 뷰는 후속 Task (A12/A13) 에서 구현됩니다.
          </p>
        </main>
      );
  }
}
