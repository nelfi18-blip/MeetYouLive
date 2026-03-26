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
  },

  callbacks: {
    async jwt({ token, account, profile }) {
      // On first sign-in via Google, fetch the backend token server-side so it
      // is available immediately when the user reaches the dashboard, preventing
      // the redirect loop caused by an empty backendToken on arrival.
      if (account && profile) {
        token.googleEmail = profile.email;
        token.googleName = profile.name || "";
        try {
          const apiUrl = process.env.NEXT_PUBLIC_API_URL;
          const res = await fetch(`${apiUrl}/api/auth/google-session`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-internal-api-secret": process.env.INTERNAL_API_SECRET || "",
            },
            body: JSON.stringify({
              email: profile.email,
              name: profile.name || "",
            }),
          });
          if (res.ok) {
            const data = await res.json();
            token.backendToken = data.token || null;
            token.backendUser = data.user || null;
          } else {
            token.backendToken = null;
            token.backendUser = null;
          }
        } catch {
          token.backendToken = null;
          token.backendUser = null;
        }
      }
      return token;
    },

    async session({ session, token }) {
      session.backendToken = token.backendToken || null;
      session.backendUser = token.backendUser || null;
      // Expose the Google email so the proxy route can use it for token refresh
      session.googleEmail = token.googleEmail || null;
      session.googleName = token.googleName || null;
      return session;
    },
  },
};

const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };
