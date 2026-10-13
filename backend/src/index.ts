import express, { Request, Response } from "express";
import http from "http";
import cors from "cors";
import { Server } from "socket.io";
import dotenv from "dotenv";
import { RoomManager } from "./classes/RoomManager";
import { registerSocketHandlers } from "./socket/handlers";

dotenv.config({ quiet: true });
const PORT = Number(process.env.PORT) || 5000;

// Which websites may connect. Comma-separated, so local + deployed frontend both work:
// CLIENT_URL=http://localhost:5173,https://my-skribbl.vercel.app
const CLIENT_URLS = (process.env.CLIENT_URL || "http://localhost:5173")
  .split(",")
  .map((url) => url.trim());

const app = express();
app.use(cors({ origin: CLIENT_URLS }));
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: CLIENT_URLS},
});

const roomManager = new RoomManager(io);
registerSocketHandlers(io, roomManager);

app.get("/", (req: Request, res: Response) => {
  res.send("Skribbl backend is running");
})

app.get("/health", (req: Request, res: Response) => {
  res.json({ status: "ok", rooms: roomManager.getRoomCount() });
});

server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});