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

// Account switching constants
export const SWITCHING_ACCOUNT_FLAG = "switching_account";
export const SWITCHING_ACCOUNT_VALUE = "1";

/**
 * Build the account switch URL with query parameters
 */
export function buildSwitchAccountUrl() {
  return `/login?switch=${SWITCHING_ACCOUNT_VALUE}&_=${Date.now()}`;
}

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
    sessionStorage.setItem(SWITCHING_ACCOUNT_FLAG, SWITCHING_ACCOUNT_VALUE);
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
  
  // Clear specific auth keys from sessionStorage while preserving switching flag
  // Using whitelist approach for better performance and clarity
  const sessionKeysToRemove = [
    "token",
    "next-auth.session-token",
    "__Secure-next-auth.session-token",
    "authjs.session-token",
    "__Secure-authjs.session-token",
    "next-auth.csrf-token",
    "__Host-next-auth.csrf-token",
    "next-auth.callback-url",
    "__Secure-next-auth.callback-url"
  ];
  
  try {
    sessionKeysToRemove.forEach(key => {
      sessionStorage.removeItem(key);
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

/**
 * Fetch current user data from the backend API to check role and other info.
 * Returns the user object or null if the request fails.
 * Includes timeout to prevent infinite waiting.
 */
export async function fetchUserRole(token, timeoutMs = 15000, retries = 1) {
  if (!token) return null;
  
  const API_URL = typeof process !== 'undefined' && process.env?.NEXT_PUBLIC_API_URL 
    ? process.env.NEXT_PUBLIC_API_URL 
    : "";
  
  if (!API_URL) {
    console.error("[fetchUserRole] NEXT_PUBLIC_API_URL is not configured");
    return null;
  }
  
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(`${API_URL}/api/user/me`, {
        headers: {
          Authorization: "Bearer " + token,
        },
        signal: controller.signal,
      });

      if (!response.ok) {
        console.error("[fetchUserRole] Failed to fetch user data:", response.status);
        if (response.status === 401 || response.status === 403 || attempt >= retries) {
          return null;
        }
      } else {
        return await response.json();
      }
    } catch (error) {
      if (error.name === 'AbortError') {
        console.error("[fetchUserRole] Request timeout after", timeoutMs, "ms");
      } else {
        console.error("[fetchUserRole] Error fetching user data:", error);
      }
      if (attempt >= retries) return null;
    } finally {
      clearTimeout(timeoutId);
    }

    await new Promise((resolve) => setTimeout(resolve, 750));
  }

  return null;
}

/**
 * Check if the current user is an admin by fetching their role from the backend.
 * Returns true if the user is an admin, false otherwise.
 */
export async function isAdmin(token) {
  const user = await fetchUserRole(token);
  return user?.role === "admin";
}

/**
 * Get the appropriate home path based on user role.
 * Admin users go to /admin, regular users go to /feed.
 * Returns "/" for public visitors (when no role provided).
 */
export function getHomePath(userRole) {
  if (!userRole) return "/";
  if (userRole === "admin") return "/admin";
  return "/feed";
}
