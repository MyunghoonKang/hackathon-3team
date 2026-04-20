import { useState } from 'react';
import { socket } from '../socket';
import { PlayerList } from './PlayerList';
import { GameSelector } from './GameSelector';
import type { RoomStatePayload } from '../../shared/protocol';

interface Props {
  snap: RoomStatePayload;
  me: string;
}

// 선택된 게임 id: UnifiedSnap 에는 selectedGameId 가 있지만 RoomStatePayload interface 상으론
// snap.game?.id 로 접근해도 동일(A5 SessionManager 가 둘을 동기화). protocol.ts 건드리지 않음.
function selectedGameId(snap: RoomStatePayload): string | null {
  return snap.game?.id ?? null;
}

export function LobbyView({ snap, me }: Props) {
  const isHost = snap.hostId === me;
  const selected = selectedGameId(snap);
  const canStart =
    isHost &&
    selected !== null &&
    (snap.game
      ? snap.players.length >= snap.game.minPlayers && snap.players.length <= snap.game.maxPlayers
      : true);

  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const selectGame = (gameId: string) => {
    setErr(null);
    setBusy(true);
    socket.emit('game:select', { gameId }, (res: { error?: string } | undefined) => {
      setBusy(false);
      if (res?.error) setErr(res.error);
    });
  };

  const startGame = () => {
    setErr(null);
    setBusy(true);
    socket.emit('game:start', {}, (res: { error?: string } | undefined) => {
      setBusy(false);
      if (res?.error) setErr(res.error);
    });
  };

  const copyCode = async () => {
    try {
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(snap.roomCode);
      } else {
        const el = document.createElement('textarea');
        el.value = snap.roomCode;
        el.style.position = 'fixed';
        el.style.opacity = '0';
        document.body.appendChild(el);
        el.select();
        document.execCommand('copy');
        document.body.removeChild(el);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setErr('클립보드 복사 실패 — 수동으로 입력해주세요');
    }
  };

  return (
    <section className="lobby">
      <header className="lobby__header">
        <div className="lobby__code-group">
          <span className="lobby__code-label">룸 코드</span>
          <button
            className="lobby__code-btn"
            onClick={copyCode}
            aria-label="룸 코드 복사"
            title="클릭해서 복사"
          >
            {snap.roomCode}
            <span className="lobby__code-copy">{copied ? '복사됨' : '복사'}</span>
          </button>
        </div>
      </header>

      <section className="lobby__section">
        <h2 className="lobby__title">
          참가자 <span className="lobby__count">{snap.players.length}</span>
        </h2>
        <PlayerList players={snap.players} hostId={snap.hostId} highlightMe={me} />
      </section>

      <section className="lobby__section">
        <h2 className="lobby__title">게임</h2>
        <GameSelector selectedId={selected} onSelect={selectGame} disabled={!isHost || busy} />
        {snap.game && (
          <p className="lobby__game-desc">{snap.game.description}</p>
        )}
        {isHost ? (
          <button
            className="lobby__start-btn"
            disabled={!canStart || busy}
            onClick={startGame}
          >
            {selected ? '시작!' : '게임을 선택하세요'}
          </button>
        ) : (
          <p className="lobby__wait">호스트가 게임을 시작하기를 기다리는 중…</p>
        )}
      </section>

      {err && (
        <p className="lobby__error" role="alert" aria-live="polite">
          {err}
        </p>
      )}
    </section>
  );
}
