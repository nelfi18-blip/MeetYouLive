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

  pages: {
    signIn: "/login",
  },

  callbacks: {
    async jwt({ token, account }) {
      // On first sign-in via Google, mark backend token as pending (to be
      // fetched client-side on the login page to avoid server-side fetch issues).
      if (account) {
        token.backendToken = null;
        token.backendUser = null;
      }
      return token;
    },

    async session({ session, token }) {
      session.backendToken = token.backendToken || null;
      session.backendUser = token.backendUser || null;
      return session;
    },
  },
});

export { handler as GET, handler as POST };
