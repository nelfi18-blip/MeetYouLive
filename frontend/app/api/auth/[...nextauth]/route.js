import NextAuth from "next-auth";
import GoogleProvider from "next-auth/providers/google";

const apiUrl = process.env.NEXT_PUBLIC_API_URL;

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

        token.name = profile.name;
        token.email = profile.email;
        token.picture = profile.picture;

        try {
          const res = await fetch(`${apiUrl}/api/auth/google-session`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-nextauth-secret": process.env.NEXTAUTH_SECRET,
            },
            body: JSON.stringify({
              email: profile.email,
              name: profile.name,
            }),
          });

          if (!res.ok) {
            console.error("Backend returned:", res.status);
            token.backendToken = null;
            return token;
          }

          const data = await res.json();

          if (data?.token) {
            token.backendToken = data.token;
          } else {
            console.error("Backend token missing");
            token.backendToken = null;
          }

        } catch (err) {
          console.error("Backend session error:", err);
          token.backendToken = null;
        }
      }

      return token;
    },

    async session({ session, token }) {
      session.user.name = token.name;
      session.user.email = token.email;
      session.user.image = token.picture;
      session.backendToken = token.backendToken;

      return session;
    },
  },
});

export { handler as GET, handler as POST };
