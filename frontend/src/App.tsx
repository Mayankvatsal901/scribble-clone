import { useEffect, useState } from "react";
import { socket } from "./socket";

function App() {
  const [connected, setConnected] = useState(socket.connected);

  useEffect(() => {
    const onConnect = () => setConnected(true);
    const onDisconnect = () => setConnected(false);

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);

    // Clean up when the component unmounts, so listeners aren't added twice
    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
    };
  }, []);

  return (
    <div className="page">
      <header className="topbar">
        <span className="logo">Skribbl Clone</span>
      </header>

      <main className="center">
        <div className="card">
          <h1>Setup check</h1>
          <p>
            Server:{" "}
            <b className={connected ? "ok" : "bad"}>{connected ? "connected" : "not connected"}</b>
          </p>
        </div>
      </main>
    </div>
  );
}

export default App;