import NextAuth from "next-auth";
import { authOptions } from "@/lib/authOptions";

export { authOptions };

const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };
