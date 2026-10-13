import { useState } from "react";
import { socket } from "../socket";
import type { AckResponse } from "../types";

interface HomeProps {
  onJoined: (roomId: string) => void;
}

// Invite links look like http://localhost:5173/?room=K7CYAZ
function getRoomFromUrl(): string {
  return new URLSearchParams(window.location.search).get("room") ?? "";
}

function Home({ onJoined }: HomeProps) {
  const [name, setName] = useState("");
  const [code, setCode] = useState(getRoomFromUrl());
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // Send an event and wait for the server's reply (the "ack")
  const send = (event: string, data: object) => {
    setError("");
    setLoading(true);
    socket.emit(event, data, (res: AckResponse) => {
      setLoading(false);
      if (res.success) onJoined(res.roomId);
      else setError(res.error);
    });
  };

  const playPublic = () => send("quick_play", { playerName: name });
  const createPrivate = () => send("create_room", { hostName: name, settings: {} });

  const joinWithCode = (e: React.FormEvent) => {
    e.preventDefault(); // stop the form from reloading the page
    if (!code.trim()) return;
    send("join_room", { roomId: code.trim(), playerName: name });
  };

  return (
    <main className="center">
      <div className="home">
        <div className="home-title">
          <h1>Draw and guess with friends</h1>
          <p className="muted">One player draws, everyone else guesses the word.</p>
        </div>

        <div className="card stack">
          <label htmlFor="name">Your name</label>
          <input
            id="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Enter your name"
            maxLength={20}
          />

          <button className="btn btn-primary" onClick={playPublic} disabled={loading}>
            Play (public room)
          </button>
          <button className="btn btn-outline" onClick={createPrivate} disabled={loading}>
            Create private room
          </button>

          <div className="divider">or join with a code</div>

          <form className="row" onSubmit={joinWithCode}>
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="Room code"
              maxLength={6}
              aria-label="Room code"
            />
            <button className="btn" type="submit" disabled={loading}>
              Join
            </button>
          </form>

          {error && <p className="error">{error}</p>}
        </div>

        <div className="card">
          <h2>How to play</h2>
          <ol className="how">
            <li>Each turn one player picks a word and draws it.</li>
            <li>Others type their guesses in the chat.</li>
            <li>Faster guesses get more points. Highest score wins.</li>
          </ol>
        </div>
      </div>
    </main>
  );
}

export default Home;