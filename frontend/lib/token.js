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
