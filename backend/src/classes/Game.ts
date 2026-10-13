import { Room } from "./Room";
import { Player } from "./Player";
import {
  CANVAS_HEIGHT,
  CANVAS_WIDTH,
  MAX_POINTS_PER_STROKE,
  MAX_STROKES_PER_TURN,
  TIMINGS,
} from "../config";
import { getWordOptions } from "../data/words";
import { GamePhase, GameState, LeaderboardEntry, Stroke } from "../types";
import { clampNumber, cleanColor } from "../utils/helpers";
import { checkGuess, containsWord } from "../utils/wordMatch";


export class Game {
  phase: GamePhase = "choosing";
  round: number = 0;
  drawerId: string | null = null;
  word: string | null = null;
  wordOptions: string[] = [];
  endsAt: number = 0;
  strokes: Stroke[] = []; // everything drawn this turn (for undo + late joiners)

  private room: Room;
  private turnQueue: string[] = []; // players who still have to draw this round
  private usedWords: Set<string> = new Set();
  private timer: NodeJS.Timeout | null = null;
  private currentStroke: Stroke | null = null; 
  private nextStrokeId: number = 1;
  private pointsThisTurn: Map<string, number> = new Map();
  private revealed: Set<number> = new Set(); 
  private hintTimers: NodeJS.Timeout[] = [];

  constructor(room: Room) {
    this.room = room;
  }

  // ---------- timer ----------
  // Only one timer runs at a time. Every phase change replaces it,
  // so an old timer can never fire in the wrong phase.

  private setTimer(ms: number, callback: () => void): void {
    this.clearTimer();
    this.timer = setTimeout(callback, ms);
  }

  private clearTimer(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.hintTimers.forEach(clearTimeout);
    this.hintTimers = [];
  }

  destroy(): void {
    this.clearTimer();
  }

  // ---------- flow ----------

  start(): void {
    for (const player of this.room.players.values()) player.score = 0;
    this.room.systemMessage("The game has started!");
    this.nextRound();
  }

  private nextRound(): void {
    this.round++;
    if (this.round > this.room.settings.rounds) {
      this.endGame();
      return;
    }
    // Everyone currently in the room draws once this round, in join order
    this.turnQueue = [...this.room.players.keys()];
    this.room.systemMessage(`Round ${this.round} of ${this.room.settings.rounds}`);
    this.nextTurn();
  }

  private nextTurn(): void {
    // Take the next player who is still in the room
    let nextId: string | undefined;
    while (this.turnQueue.length > 0 && !nextId) {
      const id = this.turnQueue.shift()!;
      if (this.room.players.has(id)) nextId = id;
    }
    if (!nextId) {
      this.nextRound(); 
      return;
    }

    this.drawerId = nextId;
    this.word = null;
    this.strokes = []; 
    this.currentStroke = null;
    this.room.broadcast("canvas_clear", {});
    this.pointsThisTurn.clear();
    for (const player of this.room.players.values()) player.hasGuessed = false;
    this.revealed.clear();
    const { wordCount, wordMode } = this.room.settings;
    this.wordOptions = getWordOptions(wordCount, this.usedWords, wordMode);
    this.phase = "choosing";
    this.endsAt = Date.now() + TIMINGS.chooseWord;

    
    for (const id of this.room.players.keys()) {
      this.room.emitTo(id, "round_start", {
        round: this.round,
        drawerId: nextId,
        drawTime: this.room.settings.drawTime,
        wordOptions: id === nextId ? this.wordOptions : [],
      });
    }
    this.room.broadcastGameState();

    // If the drawer doesn't choose in time, pick a random word for them
    this.setTimer(TIMINGS.chooseWord, () => {
      const random = this.wordOptions[Math.floor(Math.random() * this.wordOptions.length)];
      this.startDrawing(random);
    });
  }

  chooseWord(playerId: string, word: string): string | null {
    if (this.phase !== "choosing") return "You can't choose a word now";
    if (playerId !== this.drawerId) return "Only the drawer can choose the word";
    if (!this.wordOptions.includes(word)) return "That word wasn't one of your options";

    this.startDrawing(word);
    return null;
  }

  private startDrawing(word: string): void {
    this.word = word;
    this.usedWords.add(word);
    this.phase = "drawing";

    const drawMs = this.room.settings.drawTime * 1000;
    this.endsAt = Date.now() + drawMs;
    this.setTimer(drawMs, () => this.endTurn("time"));
    this.scheduleHints(drawMs);

    this.room.broadcastGameState();
  }

  // ---------- hints ----------
  // With hints = 2 and an 80s turn, letters are revealed at ~27s and ~53s.
  // We never reveal more than half the letters.

  private letterPositions(): number[] {
    if (!this.word) return [];
    return this.word.split("").flatMap((ch, i) => (ch === " " ? [] : [i]));
  }

  private scheduleHints(drawMs: number): void {
    if (this.room.settings.wordMode === "hidden") return;
    const count = Math.min(this.room.settings.hints, Math.floor(this.letterPositions().length / 2));

    for (let i = 1; i <= count; i++) {
      const at = Math.round((drawMs * i) / (count + 1)); // spread evenly over the turn
      this.hintTimers.push(setTimeout(() => this.revealLetter(), at));
    }
  }

  private revealLetter(): void {
    if (this.phase !== "drawing") return;
    const hidden = this.letterPositions().filter((i) => !this.revealed.has(i));
    if (hidden.length <= 1) return; // always keep at least one letter hidden

    const pick = hidden[Math.floor(Math.random() * hidden.length)];
    this.revealed.add(pick);
    this.room.broadcastGameState(); // everyone gets the new hint
  }

  // reason: "time" (timer ran out), "all_guessed", "drawer_left"
  endTurn(reason: string): void {
    if (this.phase !== "choosing" && this.phase !== "drawing") return;
    this.clearTimer();
    const word = this.word;
    this.phase = "round_end";
    this.endsAt = Date.now() + TIMINGS.roundEnd;

    const nextDrawer = this.turnQueue.find((id) => this.room.players.has(id)) ?? null;
    this.room.broadcast("round_end", {
      word,
      reason,
      scores: this.getLeaderboard(),
      pointsThisTurn: Object.fromEntries(this.pointsThisTurn), // { playerId: points }
      nextDrawer,
    });
    if (word) this.room.systemMessage(`The word was "${word}"`);
    this.room.broadcastGameState();

    this.setTimer(TIMINGS.roundEnd, () => this.nextTurn());
  }

  private endGame(): void {
    this.clearTimer();
    this.phase = "game_over";
    this.drawerId = null;
    this.word = null;
    for (const player of this.room.players.values()) player.hasGuessed = false;
    this.endsAt = Date.now() + TIMINGS.gameOver;

    const leaderboard = this.getLeaderboard();
    this.room.broadcast("game_over", { winner: leaderboard[0] ?? null, leaderboard });
    if (leaderboard[0]) this.room.systemMessage(`${leaderboard[0].name} won the game!`);
    this.room.broadcastGameState();

    // After the podium, the room goes back to the lobby
    this.setTimer(TIMINGS.gameOver, () => this.room.finishGame());
  }

  // ---------- players joining / leaving mid-game ----------

  onPlayerJoined(playerId: string): void {
    // Late joiners still get a turn this round
    this.turnQueue.push(playerId);
  }

  onPlayerLeft(playerId: string): void {
    this.turnQueue = this.turnQueue.filter((id) => id !== playerId);

    if (this.room.players.size < 2) {
      this.room.stopGame("Not enough players, back to the lobby");
      return;
    }
    
    if (playerId === this.drawerId && (this.phase === "choosing" || this.phase === "drawing")) {
      this.endTurn("drawer_left");
      return;
    }
    // The only person who hadn't guessed yet left → everyone left has guessed
    if (this.phase === "drawing" && this.everyoneGuessed()) {
      this.endTurn("all_guessed");
    }
  }

  // ---------- guessing & chat ----------

  // Every chat message during a game comes here first
  handleMessage(player: Player, text: string): void {
    const isDrawer = player.id === this.drawerId;
    const chat = { type: "chat" as const, playerId: player.id, playerName: player.name, text };

    // 1. A guess: someone who is not the drawer and hasn't guessed yet
    if (this.phase === "drawing" && this.word && !isDrawer && !player.hasGuessed) {
      const result = checkGuess(text, this.word);
      if (result === "correct") {
        this.onCorrectGuess(player); // the correct word is never shown in chat
        return;
      }
      this.room.sendMessage(chat); // wrong guesses are visible to everyone
      this.room.emitTo(player.id, "guess_result", {
        correct: false,
        playerId: player.id,
        playerName: player.name,
        points: 0,
      });
      if (result === "close") this.privateNotice(player.id, `"${text}" is close!`);
      return;
    }

    // 2. The drawer, or someone who already guessed: they know the word,
    //    so only other people who know it can read their messages
    if (this.phase === "drawing" && (isDrawer || player.hasGuessed)) {
      if (this.word && containsWord(text, this.word)) {
        this.privateNotice(player.id, "You can't write the word in chat!");
        return;
      }
      const knowers = [...this.room.players.values()]
        .filter((p) => p.id === this.drawerId || p.hasGuessed)
        .map((p) => p.id);
      this.room.sendMessage(chat, knowers);
      return;
    }

    // 3. Anything else (choosing a word, between turns): normal chat
    this.room.sendMessage(chat);
  }

  private onCorrectGuess(player: Player): void {
    // Faster guess = more points: 400 at the very start, down to 100 at the end
    const totalMs = this.room.settings.drawTime * 1000;
    const timeLeft = Math.max(0, this.endsAt - Date.now());
    const points = Math.round(100 + 300 * (timeLeft / totalMs));

    player.score += points;
    player.hasGuessed = true;
    this.pointsThisTurn.set(player.id, points);

    // The drawer earns 50 for every player who guesses their drawing
    const drawer = this.drawerId ? this.room.players.get(this.drawerId) : undefined;
    if (drawer) {
      drawer.score += 50;
      this.pointsThisTurn.set(drawer.id, (this.pointsThisTurn.get(drawer.id) ?? 0) + 50);
    }

    this.room.broadcast("guess_result", {
      correct: true,
      playerId: player.id,
      playerName: player.name,
      points,
    });
    this.room.sendMessage({
      type: "correct",
      playerId: player.id,
      playerName: player.name,
      text: `${player.name} guessed the word!`,
    });
    this.room.broadcastState(); // scores + green tick in the player list
    this.room.broadcastGameState(); // this player can now see the word

    if (this.everyoneGuessed()) this.endTurn("all_guessed");
  }

  private everyoneGuessed(): boolean {
    const guessers = [...this.room.players.values()].filter((p) => p.id !== this.drawerId);
    return guessers.length > 0 && guessers.every((p) => p.hasGuessed);
  }

  private privateNotice(playerId: string, text: string): void {
    this.room.sendMessage({ type: "notice", playerId: null, playerName: "", text }, [playerId]);
  }

  // ---------- drawing ----------
  // Only the drawer can draw, and only while the phase is "drawing".
  // Strokes are sent to everyone EXCEPT the drawer: the drawer's browser
  // already drew the line locally, so it doesn't need it back.

  private canDraw(playerId: string): boolean {
    return this.phase === "drawing" && playerId === this.drawerId;
  }

  drawStart(playerId: string, data: any): void {
    if (!this.canDraw(playerId) || this.strokes.length >= MAX_STROKES_PER_TURN) return;
    const x = clampNumber(data?.x, 0, CANVAS_WIDTH);
    const y = clampNumber(data?.y, 0, CANVAS_HEIGHT);
    if (x === null || y === null) return;

    const stroke: Stroke = {
      id: this.nextStrokeId++,
      color: cleanColor(data?.color),
      size: clampNumber(data?.size, 1, 50) ?? 5,
      points: [x, y],
    };
    this.strokes.push(stroke);
    this.currentStroke = stroke;

    this.room.broadcastExcept(playerId, "draw_data", {
      type: "start",
      strokeId: stroke.id,
      x,
      y,
      color: stroke.color,
      size: stroke.size,
    });
  }

  drawMove(playerId: string, data: any): void {
    const stroke = this.currentStroke;
    if (!this.canDraw(playerId) || !stroke) return;
    if (stroke.points.length >= MAX_POINTS_PER_STROKE) return;
    const x = clampNumber(data?.x, 0, CANVAS_WIDTH);
    const y = clampNumber(data?.y, 0, CANVAS_HEIGHT);
    if (x === null || y === null) return;

    stroke.points.push(x, y);
    this.room.broadcastExcept(playerId, "draw_data", { type: "move", strokeId: stroke.id, x, y });
  }

  drawEnd(playerId: string): void {
    if (!this.canDraw(playerId) || !this.currentStroke) return;
    this.room.broadcastExcept(playerId, "draw_data", { type: "end", strokeId: this.currentStroke.id });
    this.currentStroke = null;
  }

  // Undo and clear go to EVERYONE (drawer too), so all canvases stay identical
  undo(playerId: string): void {
    if (!this.canDraw(playerId) || this.strokes.length === 0) return;
    this.strokes.pop();
    this.currentStroke = null;
    this.room.broadcast("canvas_state", { strokes: this.strokes });
  }

  clearCanvas(playerId: string): void {
    if (!this.canDraw(playerId)) return;
    this.strokes = [];
    this.currentStroke = null;
    this.room.broadcast("canvas_clear", {});
  }

  // ---------- state ----------

  getLeaderboard(): LeaderboardEntry[] {
    return [...this.room.players.values()]
      .map((p) => ({ playerId: p.id, name: p.name, score: p.score }))
      .sort((a, b) => b.score - a.score);
  }

  // Each player gets their own version: only the drawer sees the word while drawing
  getStateFor(playerId: string): GameState {
    const hasGuessed = this.room.players.get(playerId)?.hasGuessed ?? false;
    const canSeeWord =
      playerId === this.drawerId ||
      hasGuessed ||
      this.phase === "round_end" ||
      this.phase === "game_over";

    return {
      phase: this.phase,
      round: this.round,
      totalRounds: this.room.settings.rounds,
      drawerId: this.drawerId,
      word: canSeeWord ? this.word : null,
      hint: this.getHint(),
      endsAt: this.endsAt,
    };
  }

  // What guessers see: "ice cream" with 'c' revealed → "_ c _   _ _ _ _ _"
  private getHint(): string | null {
    if (!this.word || this.phase !== "drawing") return null;
    if (this.room.settings.wordMode === "hidden") return null; // hidden mode: no blanks at all
    return this.word
      .split("")
      .map((ch, i) => (ch === " " ? " " : this.revealed.has(i) ? ch : "_"))
      .join(" ");
  }
}