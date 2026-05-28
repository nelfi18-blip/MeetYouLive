import GoogleProvider from "next-auth/providers/google";
import { CANONICAL_HOST, CANONICAL_SITE_URL } from "@/lib/site";

const CANONICAL_ORIGIN = new URL(CANONICAL_SITE_URL).origin;
const WWW_CANONICAL_HOST = `www.${CANONICAL_HOST}`;

function resolveRedirectOrigin(baseUrl) {
  try {
    const base = new URL(baseUrl);
    if (base.hostname === CANONICAL_HOST || base.hostname === WWW_CANONICAL_HOST) {
      return CANONICAL_ORIGIN;
    }
    return base.origin;
  } catch {
    return CANONICAL_ORIGIN;
  }
}

function isSafeCallbackPath(pathname) {
  return pathname !== "/" && !pathname.startsWith("/api/auth");
}

function normalizeRedirectUrl(url, baseUrl) {
  const redirectOrigin = resolveRedirectOrigin(baseUrl);

  if (url.startsWith("/") && !url.startsWith("//")) {
    const pathUrl = new URL(url, redirectOrigin);
    return isSafeCallbackPath(pathUrl.pathname)
      ? `${redirectOrigin}${pathUrl.pathname}${pathUrl.search}${pathUrl.hash}`
      : `${redirectOrigin}/feed`;
  }

  try {
    const target = new URL(url);
    const base = new URL(baseUrl);
    const allowedHosts = new Set([
      CANONICAL_HOST,
      WWW_CANONICAL_HOST,
      base.hostname,
    ]);

    if (!allowedHosts.has(target.hostname)) {
      return `${redirectOrigin}/feed`;
    }

    return isSafeCallbackPath(target.pathname)
      ? `${redirectOrigin}${target.pathname}${target.search}${target.hash}`
      : `${redirectOrigin}/feed`;
  } catch {
    return `${redirectOrigin}/feed`;
  }
}

/**
 * Shared NextAuth configuration.
 * Kept in a plain module (not inside a route handler file) so it can be
 * imported by both the NextAuth handler and server-side helpers (e.g.
 * /api/auth/backend-token) without pulling in the full route-handler module.
 */
export const authOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    }),
  ],

  secret: process.env.NEXTAUTH_SECRET,

  session: {
    strategy: "jwt",
  },

  pages: {
    signIn: "/login",
    error: "/login",
  },

  callbacks: {
    async signIn() {
      return true;
    },

    async redirect({ url, baseUrl }) {
      return normalizeRedirectUrl(url, baseUrl);
    },

    async jwt({ token, profile }) {
      if (profile) {
        token.googleEmail = profile.email || token.email || "";
        token.googleName = profile.name || token.name || "";
        token.name = profile.name || token.name || "";
        token.email = profile.email || token.email || "";
        token.picture = profile.picture || token.picture || "";

        // Try to get the backend JWT on first sign-in so the client can use
        // it immediately. If the backend is unreachable (e.g. cold start on
        // Render), the login page falls back to /api/auth/backend-token.
        const apiUrl = process.env.API_URL || process.env.NEXT_PUBLIC_API_URL;
        const internalSecret = process.env.INTERNAL_API_SECRET;

        if (!apiUrl) {
          console.warn("[NextAuth] API_URL/NEXT_PUBLIC_API_URL is not set – cannot fetch backend token");
        } else if (!internalSecret) {
          console.warn("[NextAuth] INTERNAL_API_SECRET is not set – cannot fetch backend token");
        } else if (token.googleEmail) {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 8000);

          try {
            const res = await fetch(`${apiUrl}/api/auth/google-session`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "x-internal-api-secret": internalSecret,
              },
              body: JSON.stringify({
                email: token.googleEmail,
                name: token.googleName,
              }),
              signal: controller.signal,
            });

            if (res.ok) {
              const data = await res.json();
              if (data.token) {
                token.backendToken = data.token;
              } else {
                console.warn("[NextAuth] /api/auth/google-session responded OK but returned no token");
              }
            } else {
              let body = {};
              try {
                body = await res.json();
              } catch {
                try {
                  body = { error: await res.text() };
                } catch {
                  // ignore
                }
              }

              console.warn(
                `[NextAuth] /api/auth/google-session responded with status ${res.status} – login page will retry`,
                body
              );
            }
          } catch (err) {
            if (err instanceof Error && err.name === "AbortError") {
              console.warn("[NextAuth] Backend /api/auth/google-session timed out");
            } else {
              const message = err instanceof Error ? err.message : "Unknown error";
              console.warn("[NextAuth] Could not reach backend /api/auth/google-session:", message);
            }
          } finally {
            clearTimeout(timeoutId);
          }
        }
      }
      return token;
    },

    async session({ session, token }) {
      if (session.user) {
        session.user.name = token.name || session.user.name || "";
        session.user.email = token.email || session.user.email || "";
        session.user.image = token.picture || session.user.image || "";
      }
      // Expose backend token and Google identity for client-side auth flows
      if (token.backendToken) {
        session.backendToken = token.backendToken;
      }
      if (token.googleEmail) {
        session.googleEmail = token.googleEmail;
        session.googleName = token.googleName || "";
      }
      if (process.env.NODE_ENV !== "production") {
        console.log("[NextAuth] Session data:", {
          googleEmail: session.googleEmail || "(not set)",
          googleName: session.googleName || "(not set)",
          hasBackendToken: Boolean(session.backendToken),
        });
      }
      return session;
    },
  },
};
