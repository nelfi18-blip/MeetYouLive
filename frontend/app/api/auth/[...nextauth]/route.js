import NextAuth from "next-auth"
import GoogleProvider from "next-auth/providers/google"

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

    async signIn() {
      return true
    },

    async jwt({ token, account, profile }) {

      if (account) {
        token.accessToken = account.access_token
      }

      if (profile) {
        token.name = profile.name
        token.email = profile.email
        token.picture = profile.picture
      }

      return token
    },

    async session({ session, token }) {

      if (token) {
        session.user.name = token.name
        session.user.email = token.email
        session.user.image = token.picture
      }

      return session
    },

  },

})

export { handler as GET, handler as POST }
