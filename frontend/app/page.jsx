import LandingPageContent from "@/components/LandingPageContent";
import { authOptions } from "@/lib/authOptions";
import { DEFAULT_AUTH_REDIRECT } from "@/lib/redirects";
import { canonicalUrl } from "@/lib/site";
import { getServerSession } from "next-auth";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export const metadata = {
  title: "MeetYouLive - Match, chat y live streaming",
  description:
    "MeetYouLive es una plataforma premium para hacer match, chatear, ver directos, hacer video llamadas, comprar coins y apoyar creadores con regalos virtuales.",
  alternates: {
    canonical: canonicalUrl("/"),
  },
  openGraph: {
    title: "MeetYouLive - Match, chat y live streaming",
    description:
      "Conoce personas, disfruta live streaming, video calls, coins, regalos virtuales y creadores de contenido en una plataforma segura.",
    url: canonicalUrl("/"),
    siteName: "MeetYouLive",
    type: "website",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 835,
        alt: "MeetYouLive",
      },
    ],
  },
};

export default async function LandingPage() {
  const cookieStore = await cookies();
  const hasBackendSession = Boolean(cookieStore.get("auth-session")?.value);
  const nextAuthSession = await getServerSession(authOptions);

  if (hasBackendSession || nextAuthSession) {
    redirect(DEFAULT_AUTH_REDIRECT);
  }

  return <LandingPageContent />;
}
