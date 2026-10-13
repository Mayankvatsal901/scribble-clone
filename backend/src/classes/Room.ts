import { Server } from "socket.io";
import { Player } from "./Player";
import { Game } from "./Game";
import { ChatMessage, GamePhase, PlayerInfo, RoomSettings, RoomState } from "../types";
import { MAX_MESSAGE_LENGTH, TIMINGS } from "../config";
import { validateSettings } from "../utils/helpers";

export class Room {
  id: string;
  isPublic: boolean;
  settings: RoomSettings;
  hostId: string | null = null; // always null for public rooms
  players: Map<string, Player> = new Map();
  game: Game | null = null; // null = waiting in the lobby
  private io: Server;
  private autoStartTimer: NodeJS.Timeout | null = null;

  constructor(id: string, isPublic: boolean, settings: RoomSettings, io: Server) {
    this.id = id;
    this.isPublic = isPublic;
    this.settings = settings;
    this.io = io;
  }

  get phase(): GamePhase {
    return this.game ? this.game.phase : "lobby";
  }

  isFull(): boolean {
    return this.players.size >= this.settings.maxPlayers;
  }

  isEmpty(): boolean {
    return this.players.size === 0;
  }



  addPlayer(player: Player): void {
    this.players.set(player.id, player);

   
    if (!this.isPublic && this.hostId === null) {
      this.hostId = player.id;
    }

    this.broadcast("player_joined", {
      player: player.toInfo(this.hostId),
      players: this.getPlayerList(),
    });
    this.systemMessage(`${player.name} joined the room`);

    this.game?.onPlayerJoined(player.id); // joined mid-game → gets a turn too
    this.broadcastState();
      if (this.game) {
      // Joined mid-game: send them the current game and everything drawn so far
      this.emitTo(player.id, "game_state", this.game.getStateFor(player.id));
      this.emitTo(player.id, "canvas_state", { strokes: this.game.strokes });
    }

    this.checkAutoStart();
  }

  // reason is shown in chat, e.g. "Bob left the room" / "Bob was kicked by the host"
  removePlayer(playerId: string, reason: string = "left the room"): void {
    const player = this.players.get(playerId);
    if (!player) return;
    this.players.delete(playerId);

    // If the host left a private room, hand host to the next player
    if (this.hostId === playerId) {
      const nextId = this.players.keys().next().value;
      this.hostId = nextId ?? null;
    }

    this.broadcast("player_left", { playerId, players: this.getPlayerList() });
    this.systemMessage(`${player.name} ${reason}`);
    this.game?.onPlayerLeft(playerId);
    this.broadcastState();
  }

 

  setReady(playerId: string, ready: boolean): void {
    const player = this.players.get(playerId);
    if (!player) return;
    player.isReady = ready;
    this.broadcastState();
  }

  updateSettings(playerId: string, input: unknown): string | null {
    if (this.isPublic) return "Public rooms use fixed settings";
    if (playerId !== this.hostId) return "Only the host can change settings";
    if (this.game) return "Settings can't be changed during a game";

    // Merge the changes onto the current settings, then validate everything
    const next = validateSettings({ ...this.settings, ...(input as object) });
    // Don't allow max players below the number of people already here
    next.maxPlayers = Math.max(next.maxPlayers, this.players.size);

    this.settings = next;
    this.broadcastState();
    return null;
  }

  kickPlayer(byId: string, targetId: string): string | null {
    if (this.isPublic) return "There is no host in public rooms";
    if (byId !== this.hostId) return "Only the host can kick players";
    if (targetId === byId || !this.players.has(targetId)) return "Invalid player";

    this.removePlayer(targetId, "was kicked by the host");
    return null;
  }

  // ---------- starting & stopping the game ----------

  startGame(playerId: string | null): string | null {
    // playerId = null means the server itself is starting it (public rooms)
    if (playerId !== null && this.isPublic) return "Public games start automatically";
    if (playerId !== null && playerId !== this.hostId) return "Only the host can start the game";
    if (this.game) return "The game has already started";
    if (this.players.size < 2) return "You need at least 2 players";

    this.game = new Game(this);
    this.game.start();
    this.broadcastState();
    return null;
  }

  // Public rooms: start by themselves a few seconds after 2+ players are in
  private checkAutoStart(): void {
    if (!this.isPublic || this.game || this.autoStartTimer || this.players.size < 2) return;

    this.systemMessage(`Game starting in ${TIMINGS.autoStart / 1000} seconds...`);
    this.autoStartTimer = setTimeout(() => {
      this.autoStartTimer = null;
      this.startGame(null);
    }, TIMINGS.autoStart);
  }

  // Called when too many players leave in the middle of a game
  stopGame(reason: string): void {
    this.game?.destroy();
    this.game = null;
    this.systemMessage(reason);
    this.broadcastState();
  }

  
  finishGame(): void {
    this.game?.destroy();
    this.game = null;
    for (const player of this.players.values()) player.isReady = false;
    this.broadcastState();
    this.checkAutoStart(); // public rooms immediately queue the next game
  }

  destroy(): void {
    this.game?.destroy();
    if (this.autoStartTimer) clearTimeout(this.autoStartTimer);
  }


  sendChat(playerId: string, text: string): void {
    const player = this.players.get(playerId);
    const clean = text.trim().slice(0, MAX_MESSAGE_LENGTH);
    if (!player || !clean) return;

    
    if (this.game) {
      this.game.handleMessage(player, clean);
      return;
    }
    this.sendMessage({ type: "chat", playerId, playerName: player.name, text: clean });
  }

  systemMessage(text: string): void {
    this.sendMessage({ type: "system", playerId: null, playerName: "", text });
  }

  sendMessage(message: ChatMessage, onlyTo?: string[]): void {
    if (!onlyTo) {
      this.broadcast("chat_message", message);
      return;
    }
    for (const id of onlyTo) this.emitTo(id, "chat_message", message);
  }

 

  getPlayerList(): PlayerInfo[] {
    return [...this.players.values()].map((p) => p.toInfo(this.hostId));
  }

  getState(): RoomState {
    return {
      roomId: this.id,
      isPublic: this.isPublic,
      phase: this.phase,
      hostId: this.hostId,
      settings: this.settings,
      players: this.getPlayerList(),
    };
  }

 
  broadcast(event: string, data: unknown): void {
    this.io.to(this.id).emit(event, data);
  }

  
  emitTo(playerId: string, event: string, data: unknown): void {
    this.io.to(playerId).emit(event, data);
  }
    // Send to everyone in the room except one player (used for drawing)
  broadcastExcept(playerId: string, event: string, data: unknown): void {
    this.io.to(this.id).except(playerId).emit(event, data);
  }

  broadcastState(): void {
    this.broadcast("room_state", this.getState());
  }


  broadcastGameState(): void {
    if (!this.game) return;
    for (const id of this.players.keys()) {
      this.emitTo(id, "game_state", this.game.getStateFor(id));
    }
  }
}