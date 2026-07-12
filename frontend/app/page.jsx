import LandingPageContent from "@/components/LandingPageContent";
import { canonicalUrl } from "@/lib/site";

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

export default function LandingPage() {
  return <LandingPageContent />;
}
