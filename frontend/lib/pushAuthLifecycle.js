// A signal ONLY: never include JWTs in events, logs or URL parameters.
// Email/password login has no NextAuth session transition; native FCM token
// registration must still run immediately after setToken().
export const BACKEND_TOKEN_READY_EVENT = "meetyoulive:backend-token-ready";
