import { io } from "socket.io-client";

// The backend address. Locally it's http://localhost:5000,
// after deploying it's the Render URL (set in .env / Vercel settings).
const SERVER_URL = import.meta.env.VITE_SERVER_URL || "http://localhost:5000";

// ONE connection for the whole app. Every screen imports this same socket.
export const socket = io(SERVER_URL);