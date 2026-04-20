import { useEffect, useState } from 'react';
import type { GameMeta } from '../../shared/protocol';

interface Props {
  selectedId: string | null;
  onSelect: (id: string) => void;
  disabled?: boolean;
}

export function GameSelector({ selectedId, onSelect, disabled }: Props) {
  const [games, setGames] = useState<GameMeta[]>([]);
  const [loadErr, setLoadErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    // A6/A7 (games API) 미머지 상태에서는 404 기대. 그땐 빈 배열로 유지.
    fetch('/api/games')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((data: unknown) => {
        if (cancelled) return;
        if (Array.isArray(data)) setGames(data as GameMeta[]);
        else if (data && typeof data === 'object' && 'games' in data) {
          setGames((data as { games: GameMeta[] }).games);
        }
      })
      .catch((e: Error) => {
        if (cancelled) return;
        setLoadErr(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="game-selector">
      <select
        className="game-selector__select"
        value={selectedId ?? ''}
        onChange={(e) => onSelect(e.target.value)}
        disabled={disabled}
        aria-label="게임 선택"
      >
        <option value="" disabled>
          {games.length === 0 ? '등록된 게임이 없습니다' : '게임을 선택하세요'}
        </option>
        {games.map((g) => (
          <option key={g.id} value={g.id}>
            {g.title} ({g.minPlayers}–{g.maxPlayers}명)
          </option>
        ))}
      </select>
      {loadErr && games.length === 0 && (
        <p className="game-selector__hint">
          게임 목록 로드 실패 ({loadErr}). A7 Upload API 머지 후 표시됩니다.
        </p>
      )}
    </div>
  );
}
