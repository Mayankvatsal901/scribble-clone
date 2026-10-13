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


    
    const getMyRoom = (): Room | undefined => {
      const roomId: string | undefined = socket.data.roomId;
      return roomId ? roomManager.getRoom(roomId) : undefined;
    };

    // Tell only this player that something went wrong
    const sendError = (message: string): void => {
      socket.emit("error_message", { message });
    };

    // Remove this socket from the room it is currently in (if any)
    const leaveCurrentRoom = (): void => {
      const room = getMyRoom();
      if (socket.data.roomId) socket.leave(socket.data.roomId);
      socket.data.roomId = undefined;
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

    // ---------- rooms ----------

    socket.on("create_room", (data: any, ack?: Ack) => {
      const room = roomManager.createRoom(false, validateSettings(data?.settings));
      console.log(`Private room ${room.id} created`);
      joinRoom(room, data?.hostName, ack);
    });

    socket.on("join_room", (data: any, ack?: Ack) => {
      const room = roomManager.getRoom(String(data?.roomId ?? ""));
      if (!room) {
        ack?.({ success: false, error: "Room not found" });
        return;
      }
      joinRoom(room, data?.playerName, ack);
    });

    socket.on("quick_play", (data: any, ack?: Ack) => {
      let room = roomManager.findPublicRoom();
      if (!room) {
        room = roomManager.createRoom(true, { ...DEFAULT_SETTINGS });
        console.log(`Public room ${room.id} created`);
      }
      joinRoom(room, data?.playerName, ack);
    });

    socket.on("leave_room", () => leaveCurrentRoom());

    // ---------- lobby ----------

    socket.on("set_ready", (data: any) => {
      getMyRoom()?.setReady(socket.id, Boolean(data?.ready));
    });

    socket.on("update_settings", (data: any) => {
      const room = getMyRoom();
      if (!room) return;
      const error = room.updateSettings(socket.id, data?.settings);
      if (error) sendError(error);
    });

    socket.on("kick_player", (data: any) => {
      const room = getMyRoom();
      if (!room) return;
      const targetId = String(data?.playerId ?? "");

      const error = room.kickPlayer(socket.id, targetId);
      if (error) {
        sendError(error);
        return;
      }


      const target = io.sockets.sockets.get(targetId);
      if (target) {
        target.emit("kicked", { reason: "You were kicked by the host" });
        target.leave(room.id);
        target.data.roomId = undefined;
      }
    });

    socket.on("start_game", () => {
      const room = getMyRoom();
      if (!room) return;
      const error = room.startGame(socket.id);
      if (error) sendError(error);
    });

    socket.on("word_chosen", (data: any) => {
      const game = getMyRoom()?.game;
      if (!game) return;
      const error = game.chooseWord(socket.id, String(data?.word ?? ""));
      if (error) sendError(error);
    });
        // ---------- drawing ----------
    // No error messages here: these events arrive many times per second

    socket.on("draw_start", (data: any) => getMyRoom()?.game?.drawStart(socket.id, data));
    socket.on("draw_move", (data: any) => getMyRoom()?.game?.drawMove(socket.id, data));
    socket.on("draw_end", () => getMyRoom()?.game?.drawEnd(socket.id));
    socket.on("draw_undo", () => getMyRoom()?.game?.undo(socket.id));
    socket.on("canvas_clear", () => getMyRoom()?.game?.clearCanvas(socket.id));

    

      
    const onMessage = (data: any) => getMyRoom()?.sendChat(socket.id, String(data?.text ?? ""));
    socket.on("chat", onMessage);
    socket.on("guess", onMessage);

    socket.on("disconnect", () => {
      console.log("Player disconnected:", socket.id);
      leaveCurrentRoom();
    });
  });
}