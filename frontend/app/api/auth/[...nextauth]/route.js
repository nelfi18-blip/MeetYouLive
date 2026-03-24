import NextAuth from "next-auth";
import GoogleProvider from "next-auth/providers/google";

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

  callbacks: {
    async signIn() {
      return true;
    },

    async jwt({ token, account, profile }) {
      if (account && profile) {
        token.accessToken = account.access_token;
        token.name = profile.name;
        token.email = profile.email;

        try {
          const apiUrl = process.env.NEXT_PUBLIC_API_URL;
          const headers = { "Content-Type": "application/json" };
          const secret = process.env.INTERNAL_API_SECRET;
          if (secret) headers["x-internal-api-secret"] = secret;

          const res = await fetch(`${apiUrl}/api/auth/google-session`, {
            method: "POST",
            headers,
            body: JSON.stringify({ email: profile.email, name: profile.name }),
          });

          if (res.ok) {
            const data = await res.json();
            token.backendToken = data.token;
          }
        } catch (err) {
          console.error("Failed to exchange Google profile for backend JWT:", err);
        }
      }
      return token;
    },

    async session({ session, token }) {
      session.accessToken = token.accessToken;
      session.backendToken = token.backendToken;
      session.user.name = token.name;
      session.user.email = token.email;
      return session;
    },
  },
});

export { handler as GET, handler as POST };
