# Skribbl Clone

A multiplayer drawing and guessing game based on skribbl.io. One player draws a word, the others guess it in the chat, and faster guesses score more points.

**Live demo:** FRONTEND_URL_HERE
**Backend:** https://scribble-backend-9t69.onrender.com

Note: the backend runs on Render's free plan, so it sleeps when nobody is using it. The first connection can take around 30 to 50 seconds to wake it up.

## Features

- Public rooms: "Play" puts you in an open public room, or creates one if none is free. There is no host, and the game starts by itself once 2 or more players are in.
- Private rooms: the host gets a room code and an invite link, changes the settings, can kick players and starts the game.
- Room settings: max players (2-20), rounds (2-10), draw time (15-240s), word choices (1-5), number of hints (0-5) and word mode.
- Word modes: normal, hidden (no blanks or hints shown) and combination (two-word options).
- Turn-based rounds: every player draws once per round. The drawer picks from a few words, or a random one is picked after 15 seconds.
- Live drawing with brush colours, brush sizes, eraser, undo and clear.
- Hints: letters are revealed during the turn (never more than half the word).
- Guessing in the chat, with "close" messages for small typos.
- Scoring based on how fast you guess, plus points for the drawer.
- Round results, final leaderboard and winner, then everyone goes back to the lobby.
- Players who join in the middle of a turn see what has already been drawn.

## Tech stack

| Part | Tech |
| --- | --- |
| Frontend | React 19, TypeScript, Vite, plain CSS |
| Backend | Node.js, Express, Socket.IO, TypeScript |
| Real-time | WebSockets (Socket.IO) |
| Hosting | Frontend on Vercel, backend on Render |

There is no database. All rooms and games live in the server's memory, because a game only lasts a few minutes and nothing needs to be saved.

## Project structure

```
scribble-clone/
├── backend/
│   ├── src/
│   │   ├── index.ts            # Express + Socket.IO server setup
│   │   ├── config.ts           # default settings, limits and timers
│   │   ├── types.ts            # shared types (RoomState, GameState, Stroke...)
│   │   ├── classes/
│   │   │   ├── Player.ts       # one player: name, score, ready, guessed
│   │   │   ├── Room.ts         # players, settings, host, chat, broadcasting
│   │   │   ├── Game.ts         # rounds, turns, timer, hints, guessing, drawing
│   │   │   └── RoomManager.ts  # creates, finds and deletes rooms
│   │   ├── socket/
│   │   │   └── handlers.ts     # receives socket events and calls the classes
│   │   ├── data/
│   │   │   └── words.ts        # word list by category
│   │   └── utils/
│   │       ├── helpers.ts      # room codes, input cleaning, settings checks
│   │       └── wordMatch.ts    # checking guesses (correct / close / wrong)
│   └── scripts/                # manual test scripts (fake players)
└── frontend/
    └── src/
        ├── App.tsx             # socket listeners + which screen to show
        ├── socket.ts           # the single Socket.IO connection
        ├── types.ts            # same types as the backend
        ├── screens/
        │   ├── Home.tsx        # name, play public, create / join private
        │   ├── Lobby.tsx       # players, settings, ready, start
        │   └── Game.tsx        # top bar, players, canvas, chat, results
        └── components/
            ├── Canvas.tsx      # drawing and showing strokes
            ├── Toolbar.tsx     # colours, sizes, eraser, undo, clear
            ├── Chat.tsx        # chat and guessing
            ├── PlayerList.tsx  # scores during the game
            └── Timer.tsx       # countdown
```

## Running it locally

You need Node.js 20 or newer. The backend and frontend run separately, so use two terminals.

**1. Backend**

```bash
cd backend
npm install
cp .env.example .env
npm run dev
```

The server starts on http://localhost:5000. Opening http://localhost:5000/health should show `{"status":"ok"}`.

**2. Frontend**

```bash
cd frontend
npm install
cp .env.example .env
npm run dev
```

Open http://localhost:5173. To play against yourself, open a second window in incognito mode (each window counts as a different player).

### Environment variables

Backend (`backend/.env`):

| Name | Example | What it does |
| --- | --- | --- |
| `PORT` | `5000` | Port the server listens on |
| `CLIENT_URL` | `http://localhost:5173` | Frontend URLs allowed to connect (CORS). Comma-separated for more than one |

Frontend (`frontend/.env`):

| Name | Example | What it does |
| --- | --- | --- |
| `VITE_SERVER_URL` | `http://localhost:5000` | Where the backend is running |

Optional backend variables for testing faster: `CHOOSE_TIME_MS`, `ROUND_END_DELAY_MS`, `GAME_OVER_DELAY_MS`, `AUTO_START_DELAY_MS`.

### Production build

```bash
# backend
npm run build   # compiles TypeScript into dist/
npm start       # runs dist/index.js

# frontend
npm run build   # creates dist/ with static files
```

## Architecture overview

### The server is in charge

The backend holds the real state of every room and game. Clients only send what the player did ("I chose this word", "I drew a line here", "I typed this"), and the server checks it before doing anything:

- It uses `socket.id` to know who sent an event, so a player can't pretend to be someone else.
- Only the drawer can draw, and only during the drawing phase.
- Only the host can change settings, kick or start a private game.
- Settings, colours, coordinates and message length are all checked and limited.
- The secret word is never sent to players who shouldn't see it. Each player gets their own version of the game state: the drawer and players who already guessed get the word, everyone else gets only the hint (`_ _ _ _`).

### Classes

The server is built with classes (OOP):

- **RoomManager** keeps a `Map` of all rooms. It creates rooms with a unique 6-letter code, finds an open public room for quick play, and deletes empty rooms.
- **Room** holds the players, the settings and the host. It handles joining, leaving (and passing the host to someone else), ready status, kicking, chat, and sending events to everyone in the room.
- **Game** is created when a game starts. It runs the rounds, turns, timers, hints, guessing, scoring and drawing.
- **Player** stores a player's name, score, ready status and whether they guessed the word this turn.

`socket/handlers.ts` only connects socket events to these classes. The game rules don't live there.

### Game flow

```
lobby -> choosing -> drawing -> round_end -> choosing -> ... -> game_over -> lobby
```

1. **choosing**: the next player in the turn order gets 1-5 words to pick from. Only they receive the options. If they don't pick within 15 seconds, a random word is chosen.
2. **drawing**: the drawer draws and the others guess. Hints are revealed at even times during the turn. The turn ends when the timer runs out, when everyone has guessed, or if the drawer leaves.
3. **round_end**: shows the word and the points everyone got, for 5 seconds.
4. When every player has drawn once, the next round starts. After the last round comes **game_over** with the leaderboard, and after 10 seconds everyone is back in the lobby.

The server only sends the time when the current phase ends (`endsAt`). Each browser counts down to that time by itself, so the server doesn't have to send a message every second. Every phase change clears the old timers, so a timer from a previous turn can never fire late.

### Real-time drawing

Everyone draws on the same 800 x 600 canvas. On screen it is stretched with CSS to fit, and mouse positions are converted back to 800 x 600 before they are sent. This way drawings look the same on any screen size.

1. When the drawer presses the mouse, their browser draws the dot right away (so it feels instant) and sends `draw_start` with the position, colour and size.
2. While the mouse moves, it sends `draw_move` with each new point. Very small moves are skipped to send fewer messages.
3. On mouse up it sends `draw_end`.
4. The server checks the drawer, saves the points into a list of strokes, and sends them as `draw_data` to everyone except the drawer, who already drew it.
5. The other browsers draw the same line from the last point to the new one.

Undo removes the last stroke on the server and sends the full list of strokes (`canvas_state`) to everyone, who clear their canvas and redraw it. Clear sends `canvas_clear`. The eraser is just white paint. A player who joins in the middle of a turn asks for the stroke list (`get_canvas`) and draws it.

### Guessing and word matching

Guesses are typed in the normal chat. During a turn, the server checks every message from a player who hasn't guessed yet:

- Both the guess and the word are made lower case, and spaces and punctuation are removed. So "  Ice-Cream " matches "ice cream".
- **Correct**: the player gets points, their name turns green, and the message itself is hidden so nobody sees the answer.
- **Close**: one letter off from a word of 4 or more letters (for example "girafe" for "giraffe"), or one full word of a two-word answer. Only that player sees "is close!". The distance is calculated with the Levenshtein algorithm.
- **Wrong**: shown in the chat like a normal message.

The drawer and players who already guessed can't type the word. Their messages are only shown to other players who know the word.

### Scoring

- Guesser: `100 + 300 x (time left / draw time)`, so between 100 and 400 points. Faster guesses get more.
- Drawer: 50 points for every player who guesses their drawing.
- If everyone guesses, the turn ends early.

### Socket events

| Client sends | What it does |
| --- | --- |
| `quick_play`, `create_room`, `join_room`, `leave_room` | Join or leave rooms |
| `set_ready`, `update_settings`, `kick_player`, `start_game` | Lobby actions |
| `word_chosen` | Drawer picks a word |
| `draw_start`, `draw_move`, `draw_end`, `draw_undo`, `canvas_clear`, `get_canvas` | Drawing |
| `chat` | Chat message or guess |

| Server sends | What it does |
| --- | --- |
| `room_state` | Players, host, settings, phase |
| `game_state` | Round, drawer, word or hint, timer (different for each player) |
| `round_start` | New turn, with word options for the drawer only |
| `draw_data`, `canvas_state`, `canvas_clear` | Drawing updates |
| `chat_message` | Chat, system messages, correct guesses, close guesses |
| `round_end`, `game_over` | Results, leaderboard and winner |
| `kicked`, `error_message` | Notices for the player |

## Deployment

- **Backend on Render** (Web Service). Root directory `backend`, build command `npm install && npm run build`, start command `npm start`. Environment variable `CLIENT_URL` is set to the frontend URL.
- **Frontend on Vercel**. Root directory `frontend`, Vite preset. Environment variable `VITE_SERVER_URL` is set to the Render URL.

The backend can't go on Vercel, because Vercel runs serverless functions that stop after each request. A WebSocket needs a server that stays running and keeps the connection open for the whole game, which Render provides.

Since rooms are kept in memory, a server restart ends all current games. That's fine for this project. Running more than one server would need something like Redis to share rooms between them.

## Testing

The `backend/scripts` folder has test scripts that act like several players connecting at once (rooms, lobby, game flow, drawing, guessing, hints). Start the backend first, then run for example:

```bash
cd backend
npx tsx scripts/test-rooms.ts
```