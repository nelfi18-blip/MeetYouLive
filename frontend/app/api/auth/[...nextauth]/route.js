import NextAuth from "next-auth";
import GoogleProvider from "next-auth/providers/google";

const apiUrl = process.env.NEXT_PUBLIC_API_URL;

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
    error: "/login",
  },

  callbacks: {
    async signIn({ user }) {
      return !!user;
    },

    async jwt({ token, account, profile }) {
      if (profile) {
        token.name = profile.name || token.name || "";
        token.email = profile.email || token.email || "";
      }

      if (account?.provider === "google" && apiUrl) {
        try {
          const response = await fetch(`${apiUrl}/api/auth/google-session`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-internal-api-secret":
                process.env.INTERNAL_API_SECRET || "",
            },
            body: JSON.stringify({
              email: profile?.email || token.email || "",
              name: profile?.name || token.name || "",
              image: profile?.picture || "",
            }),
          });

          const data = await response.json().catch(() => null);

          if (response.ok && data?.token) {
            token.backendToken = data.token;
            token.backendUser = data.user || null;
          }
        } catch (error) {
          console.error("Error creating backend session:", error);
        }
      }

      return token;
    },

    async session({ session, token }) {
      session.backendToken = token.backendToken || null;
      session.backendUser = token.backendUser || null;

      if (session.user) {
        session.user.name =
          token.backendUser?.username ||
          token.backendUser?.name ||
          token.name ||
          session.user.name ||
          "";
        session.user.email =
          token.backendUser?.email ||
          token.email ||
          session.user.email ||
          "";
      }

      return session;
    },
  },
});

export { handler as GET, handler as POST };
