// Manual test for drawing sync.
// Run the server (npm run dev), then: npx tsx scripts/test-draw.ts
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

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const [alice, bob, carol, dave] = await Promise.all([connect(), connect(), connect(), connect()]);

  const { roomId } = await send(alice, "create_room", { hostName: "Alice" });
  await send(bob, "join_room", { roomId, playerName: "Bob" });
  await send(carol, "join_room", { roomId, playerName: "Carol" });

  // Start, and let the drawer pick a word
  const starts = [alice, bob, carol].map((s) => waitFor(s, "round_start"));
  alice.emit("start_game");
  const rs = await Promise.all(starts);
  const drawerIndex = rs.findIndex((r) => r.wordOptions.length > 0);
  const drawer = [alice, bob, carol][drawerIndex];
  const others = [alice, bob, carol].filter((s) => s !== drawer);
  const drawing = waitFor(others[0], "game_state", (s) => s.phase === "drawing");
  drawer.emit("word_chosen", { word: rs[drawerIndex].wordOptions[0] });
  await drawing;
  console.log("1. Game started, drawer chose a word");

  // Record what everyone receives
  const received = new Map<Socket, any[]>();
  for (const s of [alice, bob, carol]) {
    received.set(s, []);
    s.on("draw_data", (d) => received.get(s)!.push(d));
  }

  console.log("2. Drawer draws a line (start → 2 moves → end)");
  drawer.emit("draw_start", { x: 100, y: 100, color: "#ff0000", size: 8 });
  drawer.emit("draw_move", { x: 150, y: 120 });
  drawer.emit("draw_move", { x: 9999, y: -50 }); // off the canvas → clamped
  drawer.emit("draw_end");
  await wait(300);
  console.log("   Guesser received:", received.get(others[0])!.map((d) => d.type + (d.x !== undefined ? `(${d.x},${d.y})` : "")).join(" "));
  console.log("   Drawer received its own strokes?", received.get(drawer)!.length > 0);

  console.log("3. A guesser tries to draw (should be ignored)");
  others[0].emit("draw_start", { x: 10, y: 10, color: "#000000", size: 5 });
  await wait(200);
  console.log("   Other guesser received anything?", received.get(others[1])!.some((d) => d.x === 10));

  console.log("4. Drawer draws a 2nd line, then a late joiner arrives");
  drawer.emit("draw_start", { x: 300, y: 300, color: "#0000ff", size: 4 });
  drawer.emit("draw_move", { x: 350, y: 350 });
  drawer.emit("draw_end");
  await wait(200);
  const daveCanvas = waitFor(dave, "canvas_state");
  await send(dave, "join_room", { roomId, playerName: "Dave" });
  const state = await daveCanvas;
  console.log(`   Dave got ${state.strokes.length} strokes:`, state.strokes.map((s: any) => `${s.color} [${s.points}]`).join(" | "));

  console.log("5. Drawer clicks undo");
  const afterUndo = waitFor(others[0], "canvas_state");
  drawer.emit("draw_undo");
  console.log(`   Strokes left: ${(await afterUndo).strokes.length}`);

  console.log("6. Drawer clicks clear");
  const cleared = waitFor(others[0], "canvas_clear");
  drawer.emit("canvas_clear");
  await cleared;
  console.log("   Canvas cleared for everyone");

  [alice, bob, carol, dave].forEach((s) => s.disconnect());
  process.exit(0);
}

main();