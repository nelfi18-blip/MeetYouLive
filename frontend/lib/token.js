/**
 * Centralised token helpers.
 *
 * Email/password sessions have no NextAuth cookie – the token lives only in
 * localStorage.  The middleware can't read localStorage (it runs server-side),
 * so we mirror the token presence as a plain `auth-session` cookie so that
 * the middleware can detect authenticated state for both auth flows.
 *
 * Admin sessions use a separate `admin-session` cookie and `admin_token`
 * localStorage key so the middleware can enforce role-based routing.
 */

const COOKIE_NAME = "auth-session";
const ADMIN_COOKIE_NAME = "admin-session";
const MAX_AGE = 60 * 60 * 24 * 7; // 7 days in seconds

/** Store token in localStorage and set the middleware-visible session cookie. */
export function setToken(token) {
  if (typeof window === "undefined") return;
  localStorage.setItem("token", token);
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${COOKIE_NAME}=1; path=/; max-age=${MAX_AGE}; SameSite=Lax${secure}`;
}

/** Remove token from localStorage and clear the session cookie. */
export function clearToken() {
  if (typeof window === "undefined") return;
  localStorage.removeItem("token");
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${COOKIE_NAME}=; path=/; max-age=0; SameSite=Lax${secure}`;
}

/** Read the token from localStorage. */
export function getToken() {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("token");
}

/** Store admin token in localStorage and set the admin-session cookie. */
export function setAdminToken(token) {
  if (typeof window === "undefined") return;
  localStorage.setItem("admin_token", token);
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${ADMIN_COOKIE_NAME}=1; path=/; max-age=${MAX_AGE}; SameSite=Lax${secure}`;
}

/** Remove admin token from localStorage and clear the admin-session cookie. */
export function clearAdminToken() {
  if (typeof window === "undefined") return;
  localStorage.removeItem("admin_token");
  localStorage.removeItem("admin_user");
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${ADMIN_COOKIE_NAME}=; path=/; max-age=0; SameSite=Lax${secure}`;
}

/** Read the admin token from localStorage. */
export function getAdminToken() {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("admin_token");
}

/**
 * Clear all authentication tokens and sessions for account switching.
 * Removes admin tokens, user tokens, and all related auth state.
 */
export function clearAllAuth() {
  if (typeof window === "undefined") return;
  
  // Set switching flag BEFORE clearing sessionStorage
  try {
    sessionStorage.setItem("switching_account", "1");
  } catch (e) {
    console.warn("[clearAllAuth] Could not set switching_account flag:", e);
  }
  
  // Clear admin tokens
  localStorage.removeItem("admin_token");
  localStorage.removeItem("admin_user");
  
  // Clear user tokens
  localStorage.removeItem("token");
  
  // Clear NextAuth session storage (if any) from localStorage only
  Object.keys(localStorage).forEach(key => {
    if (key.startsWith("next-auth") || key.startsWith("__Secure-next-auth")) {
      localStorage.removeItem(key);
    }
  });
  
  // DON'T clear all sessionStorage - only NextAuth keys, preserve switching_account flag
  try {
    Object.keys(sessionStorage).forEach(key => {
      if (key !== "switching_account" && (
        key.startsWith("next-auth") || 
        key.startsWith("__Secure-next-auth") ||
        key === "token"
      )) {
        sessionStorage.removeItem(key);
      }
    });
  } catch (e) {
    console.warn("[clearAllAuth] Could not clear sessionStorage:", e);
  }
  
  // Clear all auth cookies
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${COOKIE_NAME}=; path=/; max-age=0; SameSite=Lax${secure}`;
  document.cookie = `${ADMIN_COOKIE_NAME}=; path=/; max-age=0; SameSite=Lax${secure}`;
  
  // Clear NextAuth cookies (multiple possible names)
  const authCookieNames = [
    "next-auth.session-token",
    "__Secure-next-auth.session-token",
    "authjs.session-token",
    "__Secure-authjs.session-token",
    "next-auth.csrf-token",
    "__Host-next-auth.csrf-token",
    "next-auth.callback-url",
    "__Secure-next-auth.callback-url"
  ];
  
  authCookieNames.forEach(cookieName => {
    document.cookie = `${cookieName}=; path=/; max-age=0; SameSite=Lax${secure}`;
  });
}
