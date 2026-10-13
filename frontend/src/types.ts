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
  hasGuessed: boolean; // guessed the word this turn (shown green in the player list)
}
// Snapshot of a room, sent to every player when something changes
export interface RoomState {
  roomId: string;
  isPublic: boolean;
  phase: GamePhase;
  hostId: string | null;
  settings: RoomSettings;
  players: PlayerInfo[];
}

// Reply sent back to the client for create_room / join_room / quick_play
export type AckResponse =
  | { success: true; roomId: string }
  | { success: false; error: string };

export interface ChatMessage {
  type: "chat" | "system" | "correct" | "notice";
  playerId: string | null;
  playerName: string;
  text: string;
}

  // lobby → choosing (drawer picks a word) → drawing → round_end → ... → game_over
export type GamePhase = "lobby" | "choosing" | "drawing" | "round_end" | "game_over";


export interface GameState {
  phase: GamePhase;
  round: number;
  totalRounds: number;
  drawerId: string | null;
  word: string | null; 
  hint: string | null; 
  endsAt: number; 
}

export interface LeaderboardEntry {
  playerId: string;
  name: string;
  score: number;
}

export interface Stroke {
  id: number;
  color: string; // "#rrggbb" (the eraser is just white)
  size: number; // brush thickness in pixels
  points: number[];
}


