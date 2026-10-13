import { useEffect, useState } from "react";

interface TimerProps {
  endsAt: number; // timestamp from the server
}

// The server only sends the time the phase ends (endsAt).
// Every client counts down to it by itself, so the server
// doesn't have to send a message every second.
function Timer({ endsAt }: TimerProps) {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, []);

  const secondsLeft = Math.max(0, Math.ceil((endsAt - now) / 1000));

  return <div className={secondsLeft <= 10 ? "timer timer-low" : "timer"}>{secondsLeft}</div>;
}

export default Timer;