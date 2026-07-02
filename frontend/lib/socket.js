import { io } from "socket.io-client";

const URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:10000";

// Singleton socket — one connection shared across the whole app.
// autoConnect: false so we can connect after the user is authenticated.
//
// Guard: socket.io-client accesses browser globals during construction.
// On the server (SSR / Next.js "use client" pre-render) we return a
// no-op stub so the module never crashes outside the browser.
const socket =
  typeof window !== "undefined"
    ? io(URL, { autoConnect: false, transports: ["websocket", "polling"] })
    : {
        connected: false,
        connect() { return this; },
        disconnect() { return this; },
        on() { return this; },
        once() { return this; },
        off() { return this; },
        emit() { return this; },
      };

export function configureSocketAuth(token) {
  if (typeof window === "undefined" || !socket) return;
  const nextToken = token || null;
  const previousToken = socket.auth?.token || null;
  if (nextToken) {
    socket.auth = { token: nextToken };
  } else {
    delete socket.auth;
  }
  if (socket.connected && previousToken !== nextToken) {
    socket.disconnect();
    socket.connect();
  }
}

export default socket;
