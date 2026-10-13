import { Server } from "socket.io";
import { Room } from "./Room";
import { RoomSettings } from "../types";
import { generateRoomCode } from "../utils/helpers";

// Keeps track of every room on the server (in memory)
export class RoomManager {
  private rooms: Map<string, Room> = new Map();
  private io: Server;

  constructor(io: Server) {
    this.io = io;
  }

  createRoom(isPublic: boolean, settings: RoomSettings): Room {
    let code = generateRoomCode();
    while (this.rooms.has(code)) {
      code = generateRoomCode(); // extremely rare, but never reuse a code
    }
    const room = new Room(code, isPublic, settings, this.io);
    this.rooms.set(code, room);
    return room;
  }

  getRoom(roomId: string): Room | undefined {
    return this.rooms.get(roomId.trim().toUpperCase());
  }

  // Quick play: first public room that still has space
  findPublicRoom(): Room | undefined {
    for (const room of this.rooms.values()) {
      if (room.isPublic && !room.isFull()) return room;
    }
    return undefined;
  }

  deleteRoom(roomId: string): void {
    this.rooms.delete(roomId);
  }

  getRoomCount(): number {
    return this.rooms.size;
  }
}