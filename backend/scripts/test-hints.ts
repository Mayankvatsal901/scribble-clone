// Manual test: hints over time, hidden mode, combination mode.
// Run the server (npm run dev), then: npx tsx scripts/test-hints.ts   (about 17 seconds)
import { io, Socket } from "socket.io-client";

const URL = "http://localhost:5000";

function connect(): Promise<Socket> {
  return new Promise((resolve) => {
    const socket = io(URL);
    socket.on("connect", () => resolve(socket));
  });
}

function send(socket: Socket, event: string, data: object): Promise<any> {
  return new Promise((resolve) => socket.emit(event, data, resolve));
}

function waitFor(socket: Socket, event: string, check: (d: any) => boolean = () => true): Promise<any> {
  return new Promise((resolve) => {
    const handler = (data: any) => {
      if (!check(data)) return;
      socket.off(event, handler);
      resolve(data);
    };
    socket.on(event, handler);
  });
}

// Create a room with these settings, start it, and let the drawer pick the first word
async function startGame(settings: object) {
  const [host, guest] = await Promise.all([connect(), connect()]);
  const { roomId } = await send(host, "create_room", { hostName: "Host", settings });
  await send(guest, "join_room", { roomId, playerName: "Guest" });

  const starts = [waitFor(host, "round_start"), waitFor(guest, "round_start")];
  host.emit("start_game");
  const [h, g] = await Promise.all(starts);
  const drawer = h.wordOptions.length ? host : guest;
  const guesser = drawer === host ? guest : host;
  const options: string[] = h.wordOptions.length ? h.wordOptions : g.wordOptions;

  const drawing = waitFor(guesser, "game_state", (s) => s.phase === "drawing");
  drawer.emit("word_chosen", { word: options[0] });
  const state = await drawing;
  return { host, guest, guesser, options, state };
}

async function main() {
  // ---- hints ----
  console.log("1. Normal mode, drawTime 15s, hints 3:");
  const a = await startGame({ drawTime: 15, hints: 3 });
  const started = Date.now();
  console.log(`   word options: [${a.options}] → drawer picked "${a.options[0]}"`);
  console.log(`   0s   hint: ${a.state.hint}`);
  a.guesser.on("game_state", (s) => {
    if (s.phase === "drawing") {
      console.log(`   ${Math.round((Date.now() - started) / 1000)}s   hint: ${s.hint}`);
    }
  });
  await waitFor(a.host, "round_end");
  a.host.disconnect();
  a.guest.disconnect();

  // ---- hidden ----
  console.log("2. Hidden mode:");
  const b = await startGame({ wordMode: "hidden" });
  console.log(`   guesser sees word: ${b.state.word}, hint: ${b.state.hint}`);
  b.host.disconnect();
  b.guest.disconnect();

  // ---- combination ----
  console.log("3. Combination mode:");
  const c = await startGame({ wordMode: "combination" });
  console.log(`   word options: [${c.options}]`);
  console.log(`   hint: ${c.state.hint}`);
  c.host.disconnect();
  c.guest.disconnect();

  process.exit(0);
}

main();