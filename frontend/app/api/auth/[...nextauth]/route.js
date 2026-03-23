import NextAuth from "next-auth";
import GoogleProvider from "next-auth/providers/google";

const apiUrl = process.env.API_URL || process.env.NEXT_PUBLIC_API_URL;

// Derive from NEXTAUTH_URL so NextAuth and our code agree on secure-cookie mode.
// When NEXTAUTH_URL is set, it is the authoritative source: an explicit HTTP URL
// (e.g. local development with a tunnelled URL) intentionally disables secure
// cookies, even in NODE_ENV=production. Falls back to NODE_ENV for deployments
// that haven't configured NEXTAUTH_URL yet.
const useSecureCookies =
  process.env.NEXTAUTH_URL?.startsWith("https://") ??
  process.env.NODE_ENV === "production";

const handler = NextAuth({
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    }),
  ],

  secret: process.env.NEXTAUTH_SECRET,

  // Tell NextAuth to use __Secure- / __Host- cookie prefixes consistently
  // for ALL cookies (session token, state, CSRF, callbackUrl, PKCE verifier).
  // Without this, state/CSRF cookies may lack the secure prefix while the
  // session-token cookie has it, which can cause OAuthCallback state mismatches.
  useSecureCookies,

  session: {
    strategy: "jwt",
  },

  pages: {
    signIn: "/login",
    error: "/auth/error",
  },

  callbacks: {
    async signIn({ account }) {
      return account?.provider === "google";
    },

    async jwt({ token, account, profile }) {
      if (account && profile) {
        token.name = profile.name ?? null;
        token.email = profile.email ?? null;
        token.picture = profile.picture ?? null;
        token.backendToken = null;

        if (apiUrl) {
          try {
            const res = await fetch(`${apiUrl}/api/auth/google-session`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "x-internal-api-secret": process.env.INTERNAL_API_SECRET || "",
              },
              body: JSON.stringify({
                email: profile.email,
                name: profile.name,
              }),
            });

            if (res.ok) {
              const data = await res.json();
              token.backendToken = data?.token || null;
            } else {
              console.error("Backend session error:", res.status, res.statusText);
            }
          } catch (err) {
            console.error("Backend session error:", err);
          }
        } else {
          console.error("Missing API_URL environment variable");
        }
      }

      return token;
    },

    async session({ session, token }) {
      session.user = {
        name: token.name ?? null,
        email: token.email ?? null,
        image: token.picture ?? null,
      };

      session.backendToken = token.backendToken || null;

      return session;
    },

    async redirect({ url, baseUrl }) {
      if (url.startsWith("/")) return `${baseUrl}${url}`;

      try {
        if (new URL(url).origin === new URL(baseUrl).origin) {
          return url;
        }
      } catch {
        // URL inválida
      }

      return `${baseUrl}/dashboard`;
    },
  },
});

export { handler as GET, handler as POST };
