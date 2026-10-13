// Manual test: guessing, scoring and a full game until game over.
// Start the server with short timers:
//   CHOOSE_TIME_MS=2000 ROUND_END_DELAY_MS=1000 GAME_OVER_DELAY_MS=2000 npm run dev
// Then: npx tsx scripts/test-guess.ts
import { io, Socket } from "socket.io-client";
import { checkGuess } from "../src/utils/wordMatch";

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

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  // ---- 1. word matching on its own ----
  console.log("1. Word matching:");
  const cases: [string, string][] = [
    ["APPLE", "apple"],
    ["  apple  ", "apple"],
    ["ice-cream", "ice cream"],
    ["icecream", "ice cream"],
    ["girafe", "giraffe"],
    ["ice", "ice cream"],
    ["car", "cat"],
    ["banana", "apple"],
  ];
  for (const [guess, word] of cases) {
    console.log(`   "${guess}" vs "${word}" → ${checkGuess(guess, word)}`);
  }

  // ---- 2. a real game with 3 players ----
  const players = await Promise.all([connect(), connect(), connect()]);
  const [alice, bob, carol] = players;
  const names: Record<string, string> = {};

  const { roomId } = await send(alice, "create_room", { hostName: "Alice", settings: { rounds: 2 } });
  await send(bob, "join_room", { roomId, playerName: "Bob" });
  await send(carol, "join_room", { roomId, playerName: "Carol" });
  names[alice.id!] = "Alice";
  names[bob.id!] = "Bob";
  names[carol.id!] = "Carol";

  const gameOver = waitFor(alice, "game_over");
  alice.emit("start_game");

  // 3 players x 2 rounds = 6 turns
  for (let turn = 1; turn <= 6; turn++) {
    const starts = await Promise.all(players.map((s) => waitFor(s, "round_start")));
    const drawer = players[starts.findIndex((r) => r.wordOptions.length > 0)];
    const [g1, g2] = players.filter((s) => s !== drawer);
    const word: string = starts[players.indexOf(drawer)].wordOptions[0];

    const drawing = waitFor(g1, "game_state", (s) => s.phase === "drawing");
    drawer.emit("word_chosen", { word });
    await drawing;

    if (turn === 1) {
      console.log(`2. Turn 1: ${names[drawer.id!]} draws "${word}"`);

      // wrong guess → public
      const seen = waitFor(g2, "chat_message", (m) => m.text === "potato");
      g1.emit("guess", { text: "potato" });
      await seen;
      console.log(`   ${names[g1.id!]} guesses "potato" → everyone sees it in chat`);

      // close guess → only the guesser gets the notice
      if (word.replace(/ /g, "").length >= 4) {
        const typo = word.slice(0, -1) + (word.endsWith("z") ? "y" : "z");
        const notice = waitFor(g1, "chat_message", (m) => m.type === "notice");
        g1.emit("guess", { text: typo });
        console.log(`   ${names[g1.id!]} guesses "${typo}" → private: ${(await notice).text}`);
      }

      // correct guess, in capitals with spaces
      const result = waitFor(drawer, "guess_result", (r) => r.correct);
      g1.emit("guess", { text: `  ${word.toUpperCase()}  ` });
      const r = await result;
      console.log(`   ${names[g1.id!]} guesses "${word.toUpperCase()}" → correct, +${r.points} points`);

      // after guessing, their chat is only seen by people who know the word
      let leaked = false;
      const spy = (m: any) => {
        if (m.text === "that was easy") leaked = true;
      };
      g2.on("chat_message", spy);
      const drawerSees = waitFor(drawer, "chat_message", (m) => m.text === "that was easy");
      g1.emit("chat", { text: "that was easy" });
      await drawerSees;
      await wait(100);
      g2.off("chat_message", spy);
      console.log(`   ${names[g1.id!]} chats "that was easy" → drawer sees it, ${names[g2.id!]} sees it? ${leaked}`);

      // drawer can't type the word
      const warn = waitFor(drawer, "chat_message", (m) => m.type === "notice");
      drawer.emit("chat", { text: `it is ${word}` });
      console.log(`   Drawer types the word → ${(await warn).text}`);
    }

    // everyone guesses → turn ends early
    const end = waitFor(alice, "round_end");
    if (turn !== 1) g1.emit("guess", { text: word });
    g2.emit("guess", { text: word });
    const e = await end;
    if (turn === 1) {
      const pts = Object.entries(e.pointsThisTurn).map(([id, p]) => `${names[id]} +${p}`);
      console.log(`   Last guesser got it → round_end (${e.reason}), points: ${pts.join(", ")}`);
    } else {
      console.log(`   Turn ${turn}: ${names[drawer.id!]} drew "${word}", everyone guessed`);
    }
  }

  const over = await gameOver;
  console.log("3. Game over! Leaderboard:");
  over.leaderboard.forEach((p: any, i: number) => console.log(`   #${i + 1} ${p.name} - ${p.score}`));
  console.log(`   Winner: ${over.winner.name}`);

  const lobby = await waitFor(alice, "room_state", (s) => s.phase === "lobby");
  console.log(`4. Back in the ${lobby.phase}`);

  players.forEach((s) => s.disconnect());
  process.exit(0);
}

main();