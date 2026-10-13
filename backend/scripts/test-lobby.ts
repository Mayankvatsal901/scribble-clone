// Manual test for the lobby: ready, settings, chat, kick.
// Run the server first (npm run dev), then: npx tsx scripts/test-lobby.ts
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

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const [alice, bob, carol, dave] = await Promise.all([
    connect("Alice"),
    connect("Bob"),
    connect("Carol"),
    connect("Dave"),
  ]);

  let state: any = null;
  bob.on("room_state", (s) => (state = s));
  bob.on("chat_message", (m) => console.log(`   [Bob's chat] ${m.type === "system" ? "*" : m.playerName + ":"} ${m.text}`));
  carol.on("kicked", (d) => console.log(`   [Carol] kicked: ${d.reason}`));

  const { roomId } = await send(alice, "create_room", { hostName: "Alice" });
  await send(bob, "join_room", { roomId, playerName: "Bob" });
  await send(carol, "join_room", { roomId, playerName: "Carol" });
  await wait(200);

  console.log("1. Bob (not host) tries to change settings:");
  bob.emit("update_settings", { settings: { rounds: 9 } });
  await wait(200);

  console.log("2. Alice (host) sets rounds = 4 and maxPlayers = 1:");
  alice.emit("update_settings", { settings: { rounds: 4, maxPlayers: 1 } });
  await wait(200);
  console.log(`   rounds = ${state.settings.rounds}, maxPlayers = ${state.settings.maxPlayers} (can't go below 3 players)`);

  console.log("3. Bob clicks ready:");
  bob.emit("set_ready", { ready: true });
  await wait(200);
  console.log("  ", state.players.map((p: any) => `${p.name}: ${p.isReady ? "ready" : "not ready"}`).join(", "));

  console.log("4. Alice says hi:");
  alice.emit("chat", { text: "  hi everyone!  " });
  await wait(200);

  console.log("5. Alice kicks Carol:");
  alice.emit("kick_player", { playerId: carol.id });
  await wait(200);
  console.log("   Players now:", state.players.map((p: any) => p.name));

  console.log("6. Public room: Dave tries to change settings:");
  await send(dave, "quick_play", { playerName: "Dave" });
  dave.emit("update_settings", { settings: { rounds: 9 } });
  await wait(200);

  [alice, bob, carol, dave].forEach((s) => s.disconnect());
  process.exit(0);
}

main();
