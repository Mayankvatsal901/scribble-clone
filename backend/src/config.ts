import { RoomSettings } from "./types";

// Settings used for public rooms, and as the starting point for private rooms
export const DEFAULT_SETTINGS: RoomSettings = {
  maxPlayers: 8,
  rounds: 3,
  drawTime: 80,
  wordCount: 3,
  hints: 2,
  wordMode: "normal",
};

export const MAX_NAME_LENGTH = 20;
export const ROOM_CODE_LENGTH = 6;