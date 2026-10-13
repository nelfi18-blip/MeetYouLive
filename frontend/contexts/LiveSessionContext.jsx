"use client";

/**
 * LiveSessionContext — the persistent, Next.js-shared-tree-mounted
 * "administrador de sesión Live" required by the continuity/mini-player
 * feature. Mounted once in app/providers.jsx (never unmounts on internal
 * navigation) so a live session can keep existing and be represented by a
 * floating MiniPlayer while the user browses the rest of the app.
 *
 * This context only holds UI-facing state (which live is active, whether
 * it's minimized, basic creator info for the mini-player, and the
 * host/viewer action callbacks). The actual Agora client/tracks are owned
 * by frontend/lib/liveSession/liveSessionStore.js, a plain module
 * singleton — see that file for why.
 */

import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import * as liveSessionStore from "@/lib/liveSession/liveSessionStore";
import { createEndStreamGuard } from "@/lib/liveSession/endStreamGuard";

const LiveSessionContext = createContext(null);

const EMPTY_SESSION = {
  liveId: null,
  isHost: false,
  creatorName: "",
  creatorAvatar: "",
  minimized: false,
  // "idle" | "pending" | "error" — surfaced to MiniPlayer so it can show a
  // loading/disabled state while a PATCH /api/lives/:id/end request is in
  // flight, and a translatable, retryable error if the backend rejected or
  // never confirmed it (see requestEndStream below).
  endStreamStatus: "idle",
  endStreamError: "",
};

export function LiveSessionProvider({ children }) {
  const router = useRouter();
  const [session, setSession] = useState(EMPTY_SESSION);
  // Registered by the live room page while mounted so the mini-player can
  // trigger the real "end stream" backend call without duplicating it here.
  const endStreamHandlerRef = useRef(null);
  // Serializes requestEndStream() calls (double-tap on "confirm", or the
  // mini-player and the full live page both wired to the same action) so
  // at most one PATCH /api/lives/:id/end is ever in flight at a time.
  // Lazily created once via useState's initializer (not a ref read during
  // render) — its identity never changes, it's just mutated internally by
  // its own `run`/`isPending` methods.
  const [endStreamGuard] = useState(() => createEndStreamGuard());

  const registerEndStreamHandler = useCallback((handler) => {
    endStreamHandlerRef.current = handler || null;
  }, []);

  /** Called by the live room page once it has actually joined the channel. */
  const openSession = useCallback((meta) => {
    setSession((prev) => {
      if (prev.liveId && String(prev.liveId) !== String(meta.liveId)) {
        // A different live was left backgrounded — never keep two active
        // sessions, and never let a stale one be mistaken for this one.
        liveSessionStore.closeOthers(meta.liveId);
      }
      return { ...EMPTY_SESSION, ...meta, minimized: false };
    });
  }, []);

  /** Called right before an internal navigation takes the live page off-screen. */
  const minimizeSession = useCallback((liveId) => {
    setSession((prev) => {
      if (!prev.liveId || String(prev.liveId) !== String(liveId)) return prev;
      return { ...prev, minimized: true };
    });
  }, []);

  /** Mini-player "expand" control — navigates back to the full live room. */
  const restoreSession = useCallback(() => {
    if (!session.liveId) return;
    setSession((prev) => ({ ...prev, minimized: false }));
    router.push(`/live/${session.liveId}`);
  }, [router, session.liveId]);

  /** Mini-player "close" control — safely abandons viewer playback / disconnects. */
  const closeSession = useCallback(() => {
    if (!session.liveId) return;
    liveSessionStore.teardownSuspended(session.liveId);
    endStreamHandlerRef.current = null;
    setSession(EMPTY_SESSION);
  }, [session.liveId]);

  /** Host-only — "Finalizar transmisión" from the mini-player, with confirmation done by the caller.
   *
   * Safety contract (see PR review findings this fixes):
   *  - the backend call's outcome is checked explicitly (the registered
   *    handler throws on any HTTP-level or network failure) — the local
   *    session/Agora resources are only released on CONFIRMED success;
   *  - concurrent calls (double-tap, or a race between two triggers) are
   *    serialized by endStreamGuard so the backend is never asked twice
   *    at once, and every caller observes the same eventual outcome;
   *  - on failure, the session is left intact (not torn down) and a
   *    translatable error is surfaced via session.endStreamError so the
   *    UI can show it and let the host retry.
   */
  const requestEndStream = useCallback(async () => {
    const liveId = session.liveId;
    if (!liveId || !session.isHost) return;
    if (endStreamGuard.isPending()) return;

    setSession((prev) => (prev.liveId === liveId ? { ...prev, endStreamStatus: "pending", endStreamError: "" } : prev));

    try {
      await endStreamGuard.run(async () => {
        const handler = endStreamHandlerRef.current;
        if (!handler) {
          throw new Error("END_STREAM_HANDLER_UNAVAILABLE");
        }
        await handler(liveId);
      });
      // Confirmed by the backend — now (and only now) release the real
      // Agora resources, exactly once.
      liveSessionStore.teardownSuspended(liveId);
      endStreamHandlerRef.current = null;
      setSession(EMPTY_SESSION);
      router.push("/live");
    } catch {
      setSession((prev) =>
        prev.liveId === liveId ? { ...prev, endStreamStatus: "error", endStreamError: "failed" } : prev
      );
    }
  }, [router, session.liveId, session.isHost, endStreamGuard]);

  /** Lets the UI dismiss a previous end-stream failure (e.g. user cancels the retry dialog). */
  const clearEndStreamError = useCallback((liveId) => {
    setSession((prev) =>
      prev.liveId && String(prev.liveId) === String(liveId)
        ? { ...prev, endStreamStatus: "idle", endStreamError: "" }
        : prev
    );
  }, []);

  /** Called when the live page itself unmounts for a real (non-minimize) reason. */
  const clearIfActive = useCallback((liveId) => {
    setSession((prev) => (prev.liveId && String(prev.liveId) === String(liveId) ? EMPTY_SESSION : prev));
  }, []);

  const value = useMemo(
    () => ({
      session,
      openSession,
      minimizeSession,
      restoreSession,
      closeSession,
      requestEndStream,
      clearEndStreamError,
      clearIfActive,
      registerEndStreamHandler,
    }),
    [
      session,
      openSession,
      minimizeSession,
      restoreSession,
      closeSession,
      requestEndStream,
      clearEndStreamError,
      clearIfActive,
      registerEndStreamHandler,
    ]
  );

  return <LiveSessionContext.Provider value={value}>{children}</LiveSessionContext.Provider>;
}

export function useLiveSession() {
  const ctx = useContext(LiveSessionContext);
  if (!ctx) {
    throw new Error("useLiveSession must be used within a LiveSessionProvider");
  }
  return ctx;
}
