// Manual test: pretends to be 4 browsers and checks the room logic.
// Run the server first (npm run dev), then: npx tsx scripts/test-rooms.ts
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

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const [alice, bob, carol, dave] = await Promise.all([connect(), connect(), connect(), connect()]);

  let bobLatestState: any = null;
  bob.on("room_state", (state) => (bobLatestState = state));

  // 1. Private room
  const created = await send(alice, "create_room", { hostName: "Alice", settings: { rounds: 5, drawTime: 999 } });
  console.log("1. Alice creates private room:", created);

  const joined = await send(bob, "join_room", { roomId: created.roomId.toLowerCase(), playerName: "Bob" });
  console.log("2. Bob joins with the code:", joined);

  await wait(200);
  console.log("   Players:", bobLatestState.players.map((p: any) => `${p.name}${p.isHost ? " (host)" : ""}`));
  console.log("   Settings (drawTime 999 → clamped):", bobLatestState.settings);

  console.log("3. Wrong code:", await send(carol, "join_room", { roomId: "ZZZZZZ", playerName: "Carol" }));

  // 2. Public rooms
  const c = await send(carol, "quick_play", { playerName: "Carol" });
  const d = await send(dave, "quick_play", { playerName: "Dave" });
  console.log("4. Carol quick play:", c, "| Dave quick play:", d);
  console.log("   Same public room?", c.roomId === d.roomId);

  // 3. Host leaves → host moves to Bob
  alice.disconnect();
  await wait(200);
  console.log("5. Alice left. New host is Bob?", bobLatestState.hostId === bob.id);

  [bob, carol, dave].forEach((s) => s.disconnect());
  await wait(200);
  const health = await fetch(`${URL}/health`).then((r) => r.json());
  console.log("6. Everyone left, rooms on server:", health.rooms);
  process.exit(0);
}

main();