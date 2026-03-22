import NextAuth from "next-auth";
import GoogleProvider from "next-auth/providers/google";

const apiUrl = process.env.API_URL || process.env.NEXT_PUBLIC_API_URL;

const useSecureCookies =
  process.env.NODE_ENV === "production" ||
  (process.env.NEXTAUTH_URL?.startsWith("https://") ?? false);

const cookiePrefix = useSecureCookies ? "__Secure-" : "";

const handler = NextAuth({
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

  cookies: {
    sessionToken: {
      name: `${cookiePrefix}next-auth.session-token`,
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: useSecureCookies,
      },
    },
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
