import GoogleProvider from "next-auth/providers/google";

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
