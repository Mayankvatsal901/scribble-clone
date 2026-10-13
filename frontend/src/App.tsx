import { useEffect, useState } from "react";
import { socket } from "./socket";
import type { ChatMessage, GameState, RoomState } from "./types";
import Home from "./screens/Home";
import Lobby from "./screens/Lobby";
import Game from "./screens/Game";

function App() {
  const [roomId, setRoomId] = useState<string | null>(null);
  const [room, setRoom] = useState<RoomState | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [notice, setNotice] = useState("");
  const [game, setGame] = useState<GameState | null>(null);
  const [wordOptions, setWordOptions] = useState<string[]>([]);

  // Listen to the server here in App. App never unmounts,
  // so no event is missed while we switch between screens.
  useEffect(() => {
    const onRoomState = (state: RoomState) => {
      setRoom(state);
      if (state.phase === "lobby") setGame(null); // game finished → forget the old game
    };
    const onGameState = (state: GameState) => setGame(state);
    // Only the drawer gets real options; everyone else gets []
    const onRoundStart = (data: { wordOptions: string[] }) => setWordOptions(data.wordOptions);
    const onChat = (msg: ChatMessage) => setMessages((prev) => [...prev, msg]);
    const onError = (data: { message: string }) => setNotice(data.message);
    const onKicked = (data: { reason: string }) => {
      resetRoom();
      setNotice(data.reason);
    };

    socket.on("room_state", onRoomState);
    socket.on("chat_message", onChat);
    socket.on("error_message", onError);
    socket.on("kicked", onKicked);
    socket.on("game_state", onGameState);
    socket.on("round_start", onRoundStart);

    return () => {
      socket.off("room_state", onRoomState);
      socket.off("chat_message", onChat);
      socket.off("error_message", onError);
      socket.off("kicked", onKicked);
      socket.off("game_state", onGameState);
      socket.off("round_start", onRoundStart);
    };
  }, []);

  // Hide the notice after 4 seconds
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(""), 4000);
    return () => clearTimeout(timer);
  }, [notice]);

  const resetRoom = () => {
    setRoomId(null);
    setRoom(null);
    setMessages([]);
    setGame(null);
    setWordOptions([]);
    window.history.replaceState(null, "", "/"); // remove ?room=... from the address bar
  };

  const handleJoined = (id: string) => {
    setRoomId(id);
    window.history.replaceState(null, "", `/?room=${id}`); // the address bar is now the invite link
  };

  const leaveRoom = () => {
    socket.emit("leave_room");
    resetRoom();
  };

  // ---------- which screen to show ----------
  let screen;
  if (!roomId || !room) {
    screen = <Home onJoined={handleJoined} />;
  } else if (room.phase === "lobby") {
    screen = <Lobby room={room} messages={messages} onLeave={leaveRoom} />;
  } else {
    screen = (
      <Game room={room} game={game} wordOptions={wordOptions} messages={messages} onLeave={leaveRoom} />
    );
  }

  return (
    <div className="page">
      <header className="topbar">
        <span className="logo">Skribbl Clone</span>
      </header>
      {screen}
      {notice && <div className="toast">{notice}</div>}
    </div>
  );
}

export default App;