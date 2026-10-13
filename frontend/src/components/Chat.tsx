import { useEffect, useRef, useState } from "react";
import { socket } from "../socket";
import type { ChatMessage } from "../types";

interface ChatProps {
  messages: ChatMessage[];
  placeholder?: string;
}

// Used in the lobby and in the game. During a game the server decides
// whether a message is a guess, so we always just send "chat".
function Chat({ messages, placeholder = "Type a message" }: ChatProps) {
  const [text, setText] = useState("");
  const listRef = useRef<HTMLDivElement>(null);

  // Scroll to the newest message whenever the list changes
  useEffect(() => {
    const list = listRef.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, [messages]);

  const send = (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    socket.emit("chat", { text });
    setText("");
  };

  return (
    <section className="card chat">
      <h2 className="chat-title">Chat</h2>
      <div className="chat-list" ref={listRef}>
        {messages.map((m, i) => (
          <div key={i} className={`msg msg-${m.type}`}>
            {m.type === "chat" && <b>{m.playerName}: </b>}
            {m.text}
          </div>
        ))}
      </div>
      <form className="chat-form" onSubmit={send}>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={placeholder}
          maxLength={100}
          aria-label="Chat message"
        />
      </form>
    </section>
  );
}

export default Chat;