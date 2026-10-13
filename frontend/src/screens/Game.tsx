import { useEffect, useState } from "react";
import { socket } from "../socket";
import type { ChatMessage, GameState, LeaderboardEntry, RoomState } from "../types";
import Canvas from "../components/Canvas";
import Chat from "../components/Chat";
import PlayerList from "../components/PlayerList";
import Timer from "../components/Timer";

interface GameProps {
  room: RoomState;
  game: GameState | null;
  wordOptions: string[];
  messages: ChatMessage[];
  onLeave: () => void;
}

// What the server sends when a turn ends
interface RoundResult {
  word: string | null;
  reason: string; // "time" | "all_guessed" | "drawer_left"
  scores: LeaderboardEntry[];
  pointsThisTurn: Record<string, number>; // { playerId: points }
}

// What the server sends when the last round is over
interface GameResult {
  winner: LeaderboardEntry | null;
  leaderboard: LeaderboardEntry[];
}

const REASONS: Record<string, string> = {
  time: "Time's up!",
  all_guessed: "Everyone guessed the word!",
  drawer_left: "The drawer left the game.",
};

function Game({ room, game, wordOptions, messages, onLeave }: GameProps) {
  const [roundResult, setRoundResult] = useState<RoundResult | null>(null);
  const [gameResult, setGameResult] = useState<GameResult | null>(null);

  // Hooks must run before any "return", so these sit above the early return below
  useEffect(() => {
    const onRoundEnd = (data: RoundResult) => setRoundResult(data);
    const onGameOver = (data: GameResult) => setGameResult(data);
    socket.on("round_end", onRoundEnd);
    socket.on("game_over", onGameOver);
    return () => {
      socket.off("round_end", onRoundEnd);
      socket.off("game_over", onGameOver);
    };
  }, []);

  // game_state can arrive a moment after room_state
  if (!game) {
    return (
      <main className="center">
        <p className="muted">Starting the game...</p>
      </main>
    );
  }

  const isDrawer = game.drawerId === socket.id;
  const drawer = room.players.find((p) => p.id === game.drawerId);

  const chooseWord = (word: string) => socket.emit("word_chosen", { word });

  // What to show in the middle of the top bar
  let wordText = "";
  let wordInfo = "";
  if (game.word) {
    // drawer, players who guessed it, and everyone after the turn ends
    wordText = game.word;
    wordInfo = isDrawer && game.phase === "drawing" ? "Draw this" : "The word";
  } else if (game.hint) {
    // "_ _ _   _ _ _ _" → word lengths "3 4"
    wordText = game.hint;
    wordInfo = "Guess this (" + game.hint.split("   ").map((w) => w.split(" ").length).join(" ") + ")";
  } else if (game.phase === "drawing") {
    wordInfo = "Hidden word mode: no hints";
  }

  // What to show on top of the canvas (nothing while drawing)
  let overlay = null;
  if (game.phase === "choosing") {
    overlay = isDrawer ? (
      <div className="overlay">
        <h2>Choose a word</h2>
        <div className="word-options">
          {wordOptions.map((w) => (
            <button key={w} className="btn btn-outline" onClick={() => chooseWord(w)}>
              {w}
            </button>
          ))}
        </div>
      </div>
    ) : (
      <div className="overlay">
        <p>{drawer?.name ?? "Someone"} is choosing a word...</p>
      </div>
    );
  } else if (game.phase === "round_end") {
    // Everyone's points for this turn, highest first
    const rows = (roundResult?.scores ?? []).map((p) => ({
      ...p,
      points: roundResult?.pointsThisTurn[p.playerId] ?? 0,
    }));
    rows.sort((x, y) => y.points - x.points);

    overlay = (
      <div className="overlay">
        <p className="muted">{REASONS[roundResult?.reason ?? ""] ?? "Turn over"}</p>
        <h2>
          The word was <b>{roundResult?.word ?? game.word}</b>
        </h2>
        <ul className="results">
          {rows.map((r) => (
            <li key={r.playerId}>
              <span>{r.name}</span>
              <span className={r.points > 0 ? "ok" : "muted"}>+{r.points}</span>
            </li>
          ))}
        </ul>
      </div>
    );
  } else if (game.phase === "game_over") {
    const leaderboard = gameResult?.leaderboard ?? [];
    overlay = (
      <div className="overlay">
        <h1>{gameResult?.winner ? `${gameResult.winner.name} wins!` : "Game over"}</h1>
        <ul className="results">
          {leaderboard.map((p, i) => (
            <li key={p.playerId} className={i === 0 ? "first" : ""}>
              <span>
                #{i + 1} {p.name} {p.playerId === socket.id && <span className="muted">(you)</span>}
              </span>
              <span>{p.score} points</span>
            </li>
          ))}
        </ul>
        <p className="muted small">Going back to the lobby in a few seconds...</p>
      </div>
    );
  }

  const guessing = game.phase === "drawing" && !isDrawer;

  return (
    <main className="game">
      {/* ---------- top bar ---------- */}
      <div className="card game-bar">
        <Timer endsAt={game.endsAt} />
        <div className="muted">
          {game.phase === "game_over" ? "Game over" : `Round ${game.round} of ${game.totalRounds}`}
        </div>
        <div className="word-box">
          <div className="small muted">{wordInfo}</div>
          <div className="word">{wordText}</div>
        </div>
        <button className="btn" onClick={onLeave}>
          Leave
        </button>
      </div>

      {/* ---------- left: players ---------- */}
      <PlayerList players={room.players} drawerId={game.drawerId} />

      {/* ---------- middle: canvas + toolbar ---------- */}
      <section className="board-col">
        <Canvas canDraw={isDrawer && game.phase === "drawing"}>{overlay}</Canvas>
      </section>

      {/* ---------- right: chat ---------- */}
      <Chat messages={messages} placeholder={guessing ? "Type your guess here" : "Type a message"} />
    </main>
  );
}

export default Game;