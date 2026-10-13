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
import { shouldBlockSessionSwitch } from "@/lib/liveSession/sessionSwitchGuard";

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
  // Mirrors `session` synchronously (updated the instant setSession is
  // called, not after the next render/effect flush) so a caller like
  // openSession() can read the CURRENT session to make a decision BEFORE
  // calling setSession, instead of reading `prev` destructively inside the
  // updater itself. See setSessionState below and
  // frontend/lib/liveSession/sessionSwitchGuard.js for the decision this
  // enables.
  const sessionRef = useRef(EMPTY_SESSION);
  const setSessionState = useCallback((updater) => {
    setSession((prev) => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      sessionRef.current = next;
      return next;
    });
  }, []);
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

  /**
   * Called by the live room page once it has actually joined the channel.
   *
   * The "do we need to switch the single mini-player slot, and is that
   * safe to do silently?" decision is made HERE, synchronously, by
   * reading `sessionRef.current` directly — NOT inside the `setSession`
   * updater. A React state updater must stay a pure function of its
   * previous state; running a destructive side effect
   * (`liveSessionStore.closeOthers`) from inside one mixes a state
   * transition with an impure effect and makes it easy to accidentally
   * re-run under React's stricter re-invocation semantics. See
   * frontend/lib/liveSession/sessionSwitchGuard.js for the pure decision
   * this uses.
   */
  const openSession = useCallback((meta) => {
    const current = sessionRef.current;
    const incomingLiveId = meta.liveId;

    const blocked = shouldBlockSessionSwitch({
      currentLiveId: current.liveId,
      currentIsHost: current.isHost,
      incomingLiveId,
    });

    if (blocked) {
      // The host still has an ACTIVE transmission on a DIFFERENT live —
      // never silently replace or disconnect it. Leave the single
      // mini-player slot (and the host's real Agora session, untouched in
      // liveSessionStore) exactly as it is; the host keeps seeing their
      // own mini-player and can explicitly choose to restore it or end it
      // (via the existing, confirmed requestEndStream flow). The incoming
      // live room page still works as a normal full page — it's just not
      // granted the single mini-player slot while that choice is pending.
      return;
    }

    if (current.liveId && String(current.liveId) !== String(incomingLiveId)) {
      // A different VIEWER session was left backgrounded — safe to tear
      // it down before claiming the slot for this live. Never touches a
      // suspended HOST session (see liveSessionStore.closeOthers).
      liveSessionStore.closeOthers(incomingLiveId);
    }

    setSessionState(() => ({ ...EMPTY_SESSION, ...meta, minimized: false }));
  }, [setSessionState]);

  /** Called right before an internal navigation takes the live page off-screen. */
  const minimizeSession = useCallback((liveId) => {
    setSessionState((prev) => {
      if (!prev.liveId || String(prev.liveId) !== String(liveId)) return prev;
      return { ...prev, minimized: true };
    });
  }, [setSessionState]);

  /** Mini-player "expand" control — navigates back to the full live room. */
  const restoreSession = useCallback(() => {
    if (!session.liveId) return;
    setSessionState((prev) => ({ ...prev, minimized: false }));
    router.push(`/live/${session.liveId}`);
  }, [router, session.liveId, setSessionState]);

  /** Mini-player "close" control — safely abandons viewer playback / disconnects. */
  const closeSession = useCallback(() => {
    if (!session.liveId) return;
    liveSessionStore.teardownSuspended(session.liveId);
    endStreamHandlerRef.current = null;
    setSessionState(EMPTY_SESSION);
  }, [session.liveId, setSessionState]);

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

    setSessionState((prev) => (prev.liveId === liveId ? { ...prev, endStreamStatus: "pending", endStreamError: "" } : prev));

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
      setSessionState(EMPTY_SESSION);
      router.push("/live");
    } catch {
      setSessionState((prev) =>
        prev.liveId === liveId ? { ...prev, endStreamStatus: "error", endStreamError: "failed" } : prev
      );
    }
  }, [router, session.liveId, session.isHost, endStreamGuard, setSessionState]);

  /** Lets the UI dismiss a previous end-stream failure (e.g. user cancels the retry dialog). */
  const clearEndStreamError = useCallback((liveId) => {
    setSessionState((prev) =>
      prev.liveId && String(prev.liveId) === String(liveId)
        ? { ...prev, endStreamStatus: "idle", endStreamError: "" }
        : prev
    );
  }, [setSessionState]);

  /** Called when the live page itself unmounts for a real (non-minimize) reason. */
  const clearIfActive = useCallback((liveId) => {
    setSessionState((prev) => (prev.liveId && String(prev.liveId) === String(liveId) ? EMPTY_SESSION : prev));
  }, [setSessionState]);

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
