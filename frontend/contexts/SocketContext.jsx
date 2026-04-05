"use client";

import { createContext, useContext, useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { io } from "socket.io-client";

const SocketContext = createContext(null);

const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:10000";

export function SocketProvider({ children }) {
  const { data: session } = useSession();
  const socketRef = useRef(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    // Resolve token: prefer localStorage JWT (email/password), fall back to
    // NextAuth backend token (Google OAuth session).
    const localToken = localStorage.getItem("token");
    const token = localToken || session?.backendToken || null;

    if (!token) {
      // Not authenticated — disconnect any existing socket and bail out.
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
        setConnected(false);
      }
      return;
    }

    // Avoid reconnecting if already connected with the same token.
    if (socketRef.current?.connected) return;

    const socket = io(BACKEND_URL, {
      auth: { token },
      transports: ["websocket", "polling"],
      reconnectionAttempts: 5,
      reconnectionDelay: 2000,
    });

    socket.on("connect", () => setConnected(true));
    socket.on("disconnect", () => setConnected(false));

    socketRef.current = socket;

    return () => {
      socket.disconnect();
      socketRef.current = null;
      setConnected(false);
    };
    // Re-run when the session token changes (e.g. sign-in / sign-out).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.backendToken]);

  return (
    <SocketContext.Provider value={{ socket: socketRef.current, connected }}>
      {children}
    </SocketContext.Provider>
  );
}

/** Access the socket instance and connection state from any client component. */
export function useSocket() {
  return useContext(SocketContext);
}
