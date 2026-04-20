import { useRef, useEffect } from 'react';
import { useGameFrame } from '../hooks/useGameFrame';
import type { Player } from '../../shared/protocol';

interface Props {
  gameUrl: string;
  playerId: string;
  players: Player[];
  sessionId: string;
  seed: string;
  onSubmit: (value: number, playerId?: string) => void;
  showOutcome?: { loserId: string; results: { playerId: string; value: number }[] } | null;
}

export function GameFrame({ gameUrl, playerId, players, sessionId, seed, onSubmit, showOutcome }: Props) {
  const ref = useRef<HTMLIFrameElement>(null);
  const { send } = useGameFrame(ref, (msg) => {
    if (msg.type === 'ready') send({ type: 'start' });
    if (msg.type === 'submit') onSubmit(msg.value, msg.playerId);
  });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onLoad = () => {
      send({ type: 'init', playerId, players, sessionId, seed });
    };
    el.addEventListener('load', onLoad);
    return () => el.removeEventListener('load', onLoad);
  }, [playerId, players, sessionId, seed, send]);

  useEffect(() => {
    if (showOutcome) send({ type: 'outcome', ...showOutcome });
  }, [showOutcome, send]);

  return (
    <iframe
      ref={ref}
      src={gameUrl}
      sandbox="allow-scripts"
      width="100%"
      height="520"
      style={{ border: '1px solid #30363d', borderRadius: 8 }}
    />
  );
}
