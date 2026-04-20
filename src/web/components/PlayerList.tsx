import type { Player } from '../../shared/protocol';

interface Props {
  players: Player[];
  hostId: string;
  loserId?: string;
  highlightMe?: string;
}

export function PlayerList({ players, hostId, loserId, highlightMe }: Props) {
  return (
    <ul className="player-list">
      {players.map((p) => {
        const classes = ['player-chip'];
        if (p.id === loserId) classes.push('player-chip--loser');
        if (p.id === highlightMe) classes.push('player-chip--me');
        if (!p.connected) classes.push('player-chip--offline');
        return (
          <li key={p.id} className={classes.join(' ')}>
            <span className="player-chip__name">{p.name}</span>
            {p.id === hostId && <span className="player-chip__badge" aria-label="host">👑</span>}
            {!p.connected && <span className="player-chip__badge" aria-label="offline">⚫</span>}
          </li>
        );
      })}
    </ul>
  );
}
