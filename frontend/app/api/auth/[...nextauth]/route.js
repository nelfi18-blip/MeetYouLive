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
    async signIn({ user, account }) {
      try {
        if (account?.provider === "google" && API_URL) {
          const response = await fetch(`${API_URL}/api/auth/google-login`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              name: user.name,
              email: user.email,
              image: user.image,
            }),
          });

          if (!response.ok) {
            console.error("Error al sincronizar usuario con backend");
            return false;
          }

          const data = await response.json();

          user.backendToken = data.token;
          user.backendUser = data.user;
        }

        return true;
      } catch (error) {
        console.error("Error en signIn:", error);
        return false;
      }
    },

    async jwt({ token, user }) {
      if (user?.backendToken) {
        token.backendToken = user.backendToken;
      }

      if (user?.backendUser) {
        token.user = user.backendUser;
      }

      if (user?.name && !token.name) token.name = user.name;
      if (user?.email && !token.email) token.email = user.email;
      if (user?.image && !token.picture) token.picture = user.image;

      return token;
    },

    async session({ session, token }) {
      if (token?.backendToken) {
        session.backendToken = token.backendToken;
      }

      if (token?.user) {
        session.user = {
          ...session.user,
          ...token.user,
        };
      }

      return session;
    },
  },
});

export { handler as GET, handler as POST };
