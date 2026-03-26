import NextAuth from "next-auth";
import GoogleProvider from "next-auth/providers/google";

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
        token.name = profile.name || token.name || "";
        token.email = profile.email || token.email || "";
        token.picture = profile.picture || token.picture || "";
      }
      return token;
    },

    async session({ session, token }) {
      if (session.user) {
        session.user.name = token.name || session.user.name || "";
        session.user.email = token.email || session.user.email || "";
        session.user.image = token.picture || session.user.image || "";
      }
      // Expose the Google email and name at the session root so the
      // backend-token proxy and login page can detect a successfully
      // authenticated Google user and pass the correct identity to the backend.
      session.googleEmail = token.email || "";
      session.googleName = token.name || "";
      return session;
    },
  },
};

const handler = NextAuth(authOptions);
export { handler as GET, handler as POST };
