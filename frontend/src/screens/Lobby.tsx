import { useState } from "react";
import { socket } from "../socket";
import type { ChatMessage, RoomSettings, RoomState } from "../types";
import Chat from "../components/Chat";

interface LobbyProps {
  room: RoomState;
  messages: ChatMessage[];
  onLeave: () => void;
}

// [2, 3, 4, ..., 20]
const range = (from: number, to: number) =>
  Array.from({ length: to - from + 1 }, (_, i) => from + i);

const DRAW_TIMES = [15, 30, 45, 60, 80, 100, 120, 150, 180, 240];

function Lobby({ room, messages, onLeave }: LobbyProps) {
  const [copied, setCopied] = useState(false);

  const me = room.players.find((p) => p.id === socket.id);
  const isHost = room.hostId === socket.id;
  const inviteLink = `${window.location.origin}/?room=${room.roomId}`;

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(inviteLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard can be blocked (e.g. on plain http); the user can still copy from the box
      window.prompt("Copy this invite link:", inviteLink);
    }
  };

  // Only the changed setting is sent; the server merges and validates it
  const changeSetting = (key: keyof RoomSettings, value: string | number) => {
    socket.emit("update_settings", { settings: { [key]: value } });
  };

  const kick = (playerId: string) => socket.emit("kick_player", { playerId });
  const toggleReady = () => socket.emit("set_ready", { ready: !me?.isReady });
  const startGame = () => socket.emit("start_game");

  // One <select> for a numeric setting
  const numberSelect = (label: string, key: keyof RoomSettings, options: number[], unit = "") => (
    <label className="setting">
      {label}
      <select
        value={room.settings[key]}
        disabled={!isHost}
        onChange={(e) => changeSetting(key, Number(e.target.value))}
      >
        {options.map((n) => (
          <option key={n} value={n}>
            {n === 0 && key === "hints" ? "Off" : `${n}${unit}`}
          </option>
        ))}
      </select>
    </label>
  );

  return (
    <main className="lobby">
      {/* ---------- left: room code + players ---------- */}
      <section className="lobby-col">
        {!room.isPublic && (
          <div className="card">
            <div className="muted small">Room code</div>
            <div className="room-code">{room.roomId}</div>
            <div className="row">
              <input readOnly value={inviteLink} aria-label="Invite link" />
              <button className="btn btn-outline" onClick={copyLink}>
                {copied ? "Copied!" : "Copy link"}
              </button>
            </div>
          </div>
        )}

        <div className="card">
          <h2>
            Players ({room.players.length}/{room.settings.maxPlayers})
          </h2>
          <ul className="player-rows">
            {room.players.map((p) => (
              <li key={p.id} className="player-row">
                <span className="avatar">{p.name[0].toUpperCase()}</span>
                <span className="grow">
                  {p.name} {p.id === socket.id && <span className="muted">(you)</span>}
                </span>
                {p.isHost && <span className="tag">Host</span>}
                {!p.isHost && !room.isPublic && (
                  <span className={p.isReady ? "ready" : "muted small"}>
                    {p.isReady ? "Ready" : "Not ready"}
                  </span>
                )}
                {isHost && p.id !== socket.id && (
                  <button className="btn btn-small" onClick={() => kick(p.id)}>
                    Kick
                  </button>
                )}
              </li>
            ))}
          </ul>
          <button className="btn leave" onClick={onLeave}>
            Leave room
          </button>
        </div>
      </section>

      {/* ---------- middle: settings + start ---------- */}
      <section className="card lobby-col stack">
        <h2>Settings</h2>
        {room.isPublic ? (
          <p className="muted">
            Public room: default settings. The game starts by itself when 2 or more players are here.
          </p>
        ) : (
          <>
            <div className="settings-grid">
              {numberSelect("Players", "maxPlayers", range(2, 20))}
              {numberSelect("Rounds", "rounds", range(2, 10))}
              {numberSelect("Draw time", "drawTime", DRAW_TIMES, "s")}
              {numberSelect("Word choices", "wordCount", range(1, 5))}
              {numberSelect("Hints", "hints", range(0, 5))}
              <label className="setting">
                Word mode
                <select
                  value={room.settings.wordMode}
                  disabled={!isHost}
                  onChange={(e) => changeSetting("wordMode", e.target.value)}
                >
                  <option value="normal">Normal</option>
                  <option value="hidden">Hidden</option>
                  <option value="combination">Combination</option>
                </select>
              </label>
            </div>

            {isHost ? (
              <>
                <button
                  className="btn btn-primary"
                  onClick={startGame}
                  disabled={room.players.length < 2}
                >
                  Start game
                </button>
                {room.players.length < 2 && (
                  <p className="muted small">Invite at least one more player to start.</p>
                )}
              </>
            ) : (
              <>
                <button className={me?.isReady ? "btn" : "btn btn-primary"} onClick={toggleReady}>
                  {me?.isReady ? "Not ready" : "I'm ready"}
                </button>
                <p className="muted small">Waiting for the host to start the game.</p>
              </>
            )}
          </>
        )}
      </section>

      {/* ---------- right: chat ---------- */}
      <section className="lobby-col">
        <Chat messages={messages} />
      </section>
    </main>
  );
}

export default Lobby;