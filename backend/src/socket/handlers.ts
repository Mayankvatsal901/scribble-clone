import { Server, Socket } from "socket.io";
import { Player } from "../classes/Player";
import { Room } from "../classes/Room";
import { RoomManager } from "../classes/RoomManager";
import { DEFAULT_SETTINGS } from "../config";
import { AckResponse } from "../types";
import { cleanName, validateSettings } from "../utils/helpers";

type Ack = (response: AckResponse) => void;

export function registerSocketHandlers(io: Server, roomManager: RoomManager): void {
  io.on("connection", (socket: Socket) => {
    console.log("Player connected:", socket.id);

    // Remove this socket from the room it is currently in (if any)
    const leaveCurrentRoom = (): void => {
      const roomId: string | undefined = socket.data.roomId;
      if (!roomId) return;

      socket.leave(roomId);
      socket.data.roomId = undefined;

      const room = roomManager.getRoom(roomId);
      if (!room) return;
      room.removePlayer(socket.id);

      if (room.isEmpty()) {
        roomManager.deleteRoom(room.id);
        console.log(`Room ${room.id} deleted (empty)`);
      }
    };

    // Put this socket into a room as a new player
    const joinRoom = (room: Room, name: unknown, ack?: Ack): void => {
      if (socket.data.roomId === room.id) {
        ack?.({ success: true, roomId: room.id }); // already in this room
        return;
      }
      if (room.isFull()) {
        ack?.({ success: false, error: "Room is full" });
        return;
      }

      leaveCurrentRoom(); // one socket = one room at a time

      socket.join(room.id); // join the Socket.IO "channel" first...
      socket.data.roomId = room.id;
      room.addPlayer(new Player(socket.id, cleanName(name))); // ...so this player also gets the broadcast

      ack?.({ success: true, roomId: room.id });
    };

    // Private room: creator becomes host, settings come from the client
    socket.on("create_room", (data: any, ack?: Ack) => {
      const room = roomManager.createRoom(false, validateSettings(data?.settings));
      console.log(`Private room ${room.id} created`);
      joinRoom(room, data?.hostName, ack);
    });

    // Join by code or invite link
    socket.on("join_room", (data: any, ack?: Ack) => {
      const room = roomManager.getRoom(String(data?.roomId ?? ""));
      if (!room) {
        ack?.({ success: false, error: "Room not found" });
        return;
      }
      joinRoom(room, data?.playerName, ack);
    });

    // Public: join any open public room, or create a new one (no host)
    socket.on("quick_play", (data: any, ack?: Ack) => {
      let room = roomManager.findPublicRoom();
      if (!room) {
        room = roomManager.createRoom(true, { ...DEFAULT_SETTINGS });
        console.log(`Public room ${room.id} created`);
      }
      joinRoom(room, data?.playerName, ack);
    });

    socket.on("leave_room", () => leaveCurrentRoom());

    socket.on("disconnect", () => {
      console.log("Player disconnected:", socket.id);
      leaveCurrentRoom();
    });
  });
}