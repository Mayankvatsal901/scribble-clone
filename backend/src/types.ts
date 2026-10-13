// Shapes of the data we send between server and client

export type WordMode = "normal" | "hidden" | "combination";

export interface RoomSettings {
  maxPlayers: number; // 2–20
  rounds: number; // 2–10
  drawTime: number; // seconds, 15–240
  wordCount: number; // how many words the drawer chooses from, 1–5
  hints: number; // 0–5 (0 = no hints)
  wordMode: WordMode;
}

// What other players are allowed to see about a player
export interface PlayerInfo {
  id: string;
  name: string;
  score: number;
  isReady: boolean;
  isHost: boolean;
}

// Snapshot of a room, sent to every player when something changes
export interface RoomState {
  roomId: string;
  isPublic: boolean;
  hostId: string | null;
  settings: RoomSettings;
  players: PlayerInfo[];
}

// Reply sent back to the client for create_room / join_room / quick_play
export type AckResponse =
  | { success: true; roomId: string }
  | { success: false; error: string };