import express, { Request, Response } from "express";
import http from "http";
import cors from "cors";
import { Server } from "socket.io";
import dotenv from "dotenv";
import { RoomManager } from "./classes/RoomManager";
import { registerSocketHandlers } from "./socket/handlers";

dotenv.config({ quiet: true });

const PORT = Number(process.env.PORT) || 5000;
const CLIENT_URL = process.env.CLIENT_URL || "http://localhost:5173";

const app = express();
app.use(cors({ origin: CLIENT_URL }));
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: CLIENT_URL },
});

const roomManager = new RoomManager(io);
registerSocketHandlers(io, roomManager);

app.get("/health", (req: Request, res: Response) => {
  res.json({ status: "ok", rooms: roomManager.getRoomCount() });
});

server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});