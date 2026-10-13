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
export const MAX_MESSAGE_LENGTH = 100;
export const CANVAS_WIDTH = 800;
export const CANVAS_HEIGHT = 600;
export const MAX_STROKES_PER_TURN = 2000;
export const MAX_POINTS_PER_STROKE = 5000;

// Read a number from .env, or use the default (lets us shorten timers when testing)
function envNumber(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return value > 0 ? value : fallback;
}

// Game timings in milliseconds
export const TIMINGS = {
  chooseWord: envNumber("CHOOSE_TIME_MS", 15000), 
  roundEnd: envNumber("ROUND_END_DELAY_MS", 5000),
  gameOver: envNumber("GAME_OVER_DELAY_MS", 10000), 
  autoStart: envNumber("AUTO_START_DELAY_MS", 3000), 
};