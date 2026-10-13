import { socket } from "../socket";
import type { PlayerInfo } from "../types";

interface PlayerListProps {
  players: PlayerInfo[];
  drawerId: string | null;
}

// Players sorted by score. Green = already guessed the word.
function PlayerList({ players, drawerId }: PlayerListProps) {
  const sorted = [...players].sort((a, b) => b.score - a.score);

  return (
    <section className="card">
      <h2>Players</h2>
      <ul className="player-rows">
        {sorted.map((p, i) => (
          <li key={p.id} className={p.hasGuessed ? "player-row guessed" : "player-row"}>
            <span className="rank">#{i + 1}</span>
            <span className="grow">
              <div>
                {p.name} {p.id === socket.id && <span className="muted">(you)</span>}
              </div>
              <div className="small muted">{p.score} points</div>
            </span>
            {p.id === drawerId && <span title="Drawing">✏️</span>}
          </li>
        ))}
      </ul>
    </section>
  );
}

export default PlayerList;