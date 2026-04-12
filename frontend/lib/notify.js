/**
 * Global notification singleton.
 *
 * Any client component can call notify(data) to push a premium toast without
 * needing to be inside the SocketManager component tree.
 *
 * Usage:
 *   import { notify } from "@/lib/notify";
 *   notify({ icon: "✅", message: "Done!", duration: 5000 });
 *
 * The push handler is registered by SocketManager in providers.jsx via
 * registerPush(). Until registered, calls to notify() are silently dropped.
 */

let _push = null;

/** Called once by SocketManager to register the active push function. */
export function registerPush(fn) {
  _push = fn;
}

/** Push a notification from anywhere in the app. */
export function notify(data) {
  if (typeof _push === "function") {
    _push(data);
  }
}
