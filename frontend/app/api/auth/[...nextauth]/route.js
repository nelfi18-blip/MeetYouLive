import NextAuth from "next-auth";
import GoogleProvider from "next-auth/providers/google";

const API_URL = process.env.NEXT_PUBLIC_API_URL;

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

  pages: {
    signIn: "/login",
    error: "/login",
  },

  callbacks: {
    async jwt({ token, account, profile }) {
      if (account && profile) {
        token.accessToken = account.access_token;
        token.name = profile.name;
        token.email = profile.email;
        token.picture = profile.picture;

        try {
          if (API_URL) {
            const res = await fetch(`${API_URL}/api/auth/google-session`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                email: profile.email,
                name: profile.name,
              }),
            });

            if (res.ok) {
              const data = await res.json();
              token.backendToken = data.token;
            }
          }
        } catch (err) {
          console.error("Backend sync error:", err.message);
        }
      }

      return token;
    },

    async session({ session, token }) {
      if (token) {
        session.user.name = token.name;
        session.user.email = token.email;
        session.user.image = token.picture;
        session.accessToken = token.accessToken;
        session.backendToken = token.backendToken;
      }

      return session;
    },
  },
});

export { handler as GET, handler as POST };
