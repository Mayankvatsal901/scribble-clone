// Manual test for the game flow: start, word choice, timer, turns, public auto-start.
// Start the server with short timers first:
//   CHOOSE_TIME_MS=2000 ROUND_END_DELAY_MS=1000 AUTO_START_DELAY_MS=1000 npm run dev
// Then: npx tsx scripts/test-game.ts   (takes about 25 seconds)
import { io, Socket } from "socket.io-client";

const URL = "http://localhost:5000";

function connect(name: string): Promise<Socket> {
  return new Promise((resolve) => {
    const socket = io(URL);
    socket.on("connect", () => resolve(socket));
    socket.on("error_message", (e) => console.log(`   [${name} got error] ${e.message}`));
  });
}

function send(socket: Socket, event: string, data: object): Promise<any> {
  return new Promise((resolve) => socket.emit(event, data, resolve));
}

// Wait until this socket receives `event` (optionally one that matches `check`)
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

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const [alice, bob, carol, dave] = await Promise.all([
    connect("Alice"),
    connect("Bob"),
    connect("Carol"),
    connect("Dave"),
  ]);
  const names: Record<string, string> = {};

  // ---- private room ----
  const { roomId } = await send(alice, "create_room", { hostName: "Alice", settings: { drawTime: 15, rounds: 2 } });
  await send(bob, "join_room", { roomId, playerName: "Bob" });
  names[alice.id!] = "Alice";
  names[bob.id!] = "Bob";

  console.log("1. Bob (not host) tries to start:");
  bob.emit("start_game");
  await wait(200);

  console.log("2. Alice starts the game");
  const aliceStart = waitFor(alice, "round_start");
  const bobStart = waitFor(bob, "round_start");
  alice.emit("start_game");
  const [a, b] = await Promise.all([aliceStart, bobStart]);
  const drawer = a.drawerId === alice.id ? alice : bob;
  const guesser = drawer === alice ? bob : alice;
  console.log(`   Round ${a.round}, drawer is ${names[a.drawerId]}`);
  console.log(`   Alice's options: [${a.wordOptions}]  Bob's options: [${b.wordOptions}]`);

  console.log("3. Drawer picks a word:");
  const word = drawer === alice ? a.wordOptions[0] : b.wordOptions[0];
  const drawerState = waitFor(drawer, "game_state", (s) => s.phase === "drawing");
  const guesserState = waitFor(guesser, "game_state", (s) => s.phase === "drawing");
  drawer.emit("word_chosen", { word });
  const [ds, gs] = await Promise.all([drawerState, guesserState]);
  console.log(`   Drawer sees word: "${ds.word}"`);
  console.log(`   Guesser sees word: ${gs.word}, hint: "${gs.hint}"`);
  console.log(`   Time left: ${Math.round((gs.endsAt - Date.now()) / 1000)}s`);

  console.log("4. Waiting for the 15s timer to run out...");
  const end = await waitFor(alice, "round_end");
  console.log(`   round_end → word was "${end.word}", reason: ${end.reason}, next drawer: ${names[end.nextDrawer]}`);

  console.log("5. Next turn: new drawer does nothing (auto-pick after 2s)");
  const next = await waitFor(alice, "round_start");
  console.log(`   Drawer now: ${names[next.drawerId]}`);
  const auto = await waitFor(alice, "game_state", (s) => s.phase === "drawing");
  console.log(`   Auto-picked, phase: ${auto.phase}`);

  console.log("6. Bob leaves mid-game → only 1 player → back to lobby");
  const stopped = waitFor(alice, "room_state", (s) => s.phase === "lobby");
  bob.disconnect();
  console.log(`   Phase now: ${(await stopped).phase}`);

  // ---- public room ----
  console.log("7. Carol and Dave quick play → game starts by itself");
  const carolStart = waitFor(carol, "round_start");
  await send(carol, "quick_play", { playerName: "Carol" });
  await send(dave, "quick_play", { playerName: "Dave" });
  const pub = await carolStart;
  console.log(`   Public game started automatically, round ${pub.round}`);

  [alice, carol, dave].forEach((s) => s.disconnect());
  process.exit(0);
}

main();