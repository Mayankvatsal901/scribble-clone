import { Server } from "socket.io";
import { Player } from "./Player";
import { PlayerInfo, RoomSettings, RoomState } from "../types";

export class Room {
  id: string;
  isPublic: boolean;
  settings: RoomSettings;
  hostId: string | null = null; // always null for public rooms
  players: Map<string, Player> = new Map();
  private io: Server;

  constructor(id: string, isPublic: boolean, settings: RoomSettings, io: Server) {
    this.id = id;
    this.isPublic = isPublic;
    this.settings = settings;
    this.io = io;
  }

  isFull(): boolean {
    return this.players.size >= this.settings.maxPlayers;
  }

  isEmpty(): boolean {
    return this.players.size === 0;
  }

  addPlayer(player: Player): void {
    this.players.set(player.id, player);

    // Private room: the first player becomes the host.
    // Public room: nobody is host, the server runs the room.
    if (!this.isPublic && this.hostId === null) {
      this.hostId = player.id;
    }

    this.broadcast("player_joined", {
      player: player.toInfo(this.hostId),
      players: this.getPlayerList(),
    });
    this.broadcastState();
  }

  removePlayer(playerId: string): void {
    const existed = this.players.delete(playerId);
    if (!existed) return;

    // If the host left a private room, hand host to the next player
    if (this.hostId === playerId) {
      const nextId = this.players.keys().next().value;
      this.hostId = nextId ?? null;
    }

    this.broadcast("player_left", { playerId, players: this.getPlayerList() });
    this.broadcastState();
  }

  getPlayerList(): PlayerInfo[] {
    return [...this.players.values()].map((p) => p.toInfo(this.hostId));
  }

  getState(): RoomState {
    return {
      roomId: this.id,
      isPublic: this.isPublic,
      hostId: this.hostId,
      settings: this.settings,
      players: this.getPlayerList(),
    };
  }

  // Send an event to every socket in this room
  broadcast(event: string, data: unknown): void {
    this.io.to(this.id).emit(event, data);
  }

  broadcastState(): void {
    this.broadcast("room_state", this.getState());
  }
}