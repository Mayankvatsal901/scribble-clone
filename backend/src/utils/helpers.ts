import { DEFAULT_SETTINGS, MAX_NAME_LENGTH, ROOM_CODE_LENGTH } from "../config";
import { RoomSettings, WordMode } from "../types";

// No 0/O or 1/I, so codes are easy to read and type
const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function generateRoomCode(): string {
  let code = "";
  for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
    code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  }
  return code;
}

// Never trust input from the client: trim, limit length, give a default
export function cleanName(name: unknown): string {
  if (typeof name !== "string") return randomName();
  const trimmed = name.trim().slice(0, MAX_NAME_LENGTH);
  return trimmed || randomName();
}

function randomName(): string {
  return `Player${Math.floor(100 + Math.random() * 900)}`;
}

// Keep a number inside [min, max]; use the fallback if it isn't a number
function clamp(value: unknown, min: number, max: number, fallback: number): number {
  const n = Number(value);
  if (value === undefined || value === null || !Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

const WORD_MODES: WordMode[] = ["normal", "hidden", "combination"];

// Turn whatever the client sent into valid settings (the ranges come from the PDF)
export function validateSettings(input: any): RoomSettings {
  const s = input ?? {};
  return {
    maxPlayers: clamp(s.maxPlayers, 2, 20, DEFAULT_SETTINGS.maxPlayers),
    rounds: clamp(s.rounds, 2, 10, DEFAULT_SETTINGS.rounds),
    drawTime: clamp(s.drawTime, 15, 240, DEFAULT_SETTINGS.drawTime),
    wordCount: clamp(s.wordCount, 1, 5, DEFAULT_SETTINGS.wordCount),
    hints: clamp(s.hints, 0, 5, DEFAULT_SETTINGS.hints),
    wordMode: WORD_MODES.includes(s.wordMode) ? s.wordMode : DEFAULT_SETTINGS.wordMode,
  };
}


export function cleanColor(color: unknown): string {
  return typeof color === "string" && /^#[0-9a-fA-F]{6}$/.test(color) ? color : "#000000";
}


export function clampNumber(value: unknown, min: number, max: number): number | null {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.min(max, Math.max(min, Math.round(n)));
}