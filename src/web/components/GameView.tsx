import { useEffect, useState } from 'react';
import { socket } from '../socket';
import { GameFrame } from './GameFrame';
import type { GameMeta, RoomStatePayload } from '../../shared/protocol';

interface Outcome {
  loserId: string;
  results: { playerId: string; value: number }[];
}

interface Progress {
  submittedCount: number;
  total: number;
}

export function GameView({ snap, me }: { snap: RoomStatePayload; me: string }) {
  const [game, setGame] = useState<GameMeta | null>(snap.game ?? null);
  const [seed, setSeed] = useState('');
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [progress, setProgress] = useState<Progress | null>(null);

  useEffect(() => {
    const onBegin = (p: { game: GameMeta; seed: string }) => {
      setGame(p.game);
      setSeed(p.seed);
    };
    const onOutcome = (o: Outcome) => setOutcome(o);
    const onProgress = (p: Progress) => setProgress(p);

    socket.on('game:begin', onBegin);
    socket.on('game:outcome', onOutcome);
    socket.on('game:progress', onProgress);
    return () => {
      socket.off('game:begin', onBegin);
      socket.off('game:outcome', onOutcome);
      socket.off('game:progress', onProgress);
    };
  }, []);

  if (!game) return <div className="game"><p className="room__loading">게임 로딩 중…</p></div>;

  const submit = (value: number, playerId?: string) => {
    socket.emit('player:submit', { value, ...(playerId ? { playerId } : {}) }, (res: { error?: string }) => {
      if (res?.error) alert(res.error);
    });
  };

  return (
    <section className="game">
      <header className="game__header">
        <h2 className="game__title">{game.title}</h2>
        {progress && (
          <span className="game__progress">
            제출 {progress.submittedCount}/{progress.total}
          </span>
        )}
      </header>
      <GameFrame
        gameUrl={`/games/${game.id}.html`}
        playerId={me}
        players={snap.players}
        sessionId={snap.sessionId}
        seed={seed}
        onSubmit={submit}
        showOutcome={outcome}
      />
    </section>
  );
}
