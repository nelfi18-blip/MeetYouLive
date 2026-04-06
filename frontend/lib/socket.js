import { io } from "socket.io-client";

const URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:10000";

// Singleton socket — one connection shared across the whole app.
// autoConnect: false so we can connect after the user is authenticated.
const socket = io(URL, {
  autoConnect: false,
  transports: ["websocket", "polling"],
});

export default socket;
