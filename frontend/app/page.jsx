import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";

// Single-entry authentication flow:
// - Authenticated users → /feed
// - Unauthenticated users → /login (premium login screen with Google + email/password + register link)
// The previous CTA landing screen ("Entrar ahora" / "Crear cuenta") has been removed
// to eliminate the duplicate entry UX.
export default async function RootPage() {
  const session = await getServerSession(authOptions);

  if (session) {
    redirect("/feed");
  }

  redirect("/login");
}
