import "./globals.css";
import Providers from "./providers";
import NavbarWrapper from "../components/NavbarWrapper";
import MainContentWrapper from "../components/MainContentWrapper";
import BottomNavWrapper from "../components/BottomNavWrapper";
import IncomingCallNotification from "../components/IncomingCallNotification";
import FloatingGoLiveButton from "../components/FloatingGoLiveButton";
import ServiceWorkerRegistration from "../components/ServiceWorkerRegistration";
import OfflineIndicator from "../components/OfflineIndicator";
import InstallPrompt from "../components/InstallPrompt";

export const metadata = {
  metadataBase: new URL("https://meetyoulive.net"),
  title: {
    default: "MeetYouLive - Conecta, Transmite en Vivo y Conoce Personas",
    template: "%s | MeetYouLive",
  },
  description:
    "Conoce personas, haz match, transmite en vivo y conecta de manera auténtica. Plataforma de citas y streaming en vivo para crear conexiones reales.",
  manifest: "/site.webmanifest",
  icons: {
    icon: [
      { url: "/favicon.ico", type: "image/x-icon", sizes: "any" },
      { url: "/icon-192.png", type: "image/png", sizes: "192x192" },
      { url: "/icon-512.png", type: "image/png", sizes: "512x512" },
    ],
    apple: "/apple-touch-icon.png",
    shortcut: "/favicon.ico",
  },
  keywords: [
    "dating app",
    "video chat",
    "live streaming",
    "citas online",
    "app para conocer personas",
    "conocer gente nueva",
    "transmisión en vivo",
    "ganar dinero streaming",
    "video en vivo citas",
    "plataforma de citas",
    "streaming para creadores",
    "chat en vivo",
  ],
  authors: [{ name: "MeetYouLive" }],
  creator: "MeetYouLive",
  publisher: "MeetYouLive",
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  openGraph: {
    title: "MeetYouLive - Conecta, Transmite en Vivo y Conoce Personas",
    description:
      "Conoce personas, haz match, transmite en vivo y conecta de manera auténtica. Plataforma de citas y streaming en vivo.",
    url: "https://meetyoulive.net",
    siteName: "MeetYouLive",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 835,
        alt: "MeetYouLive - Conecta en vivo y conoce personas",
      },
    ],
    locale: "es_ES",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "MeetYouLive - Conecta, Transmite en Vivo y Conoce Personas",
    description:
      "Conoce personas, haz match, transmite en vivo y conecta de manera auténtica.",
    images: ["/og-image.png"],
    creator: "@meetyoulive",
    site: "@meetyoulive",
  },
  alternates: {
    canonical: "https://meetyoulive.net",
  },
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 2,
  userScalable: true,
  themeColor: "#0f0821",
};

export default function RootLayout({ children }) {
  const organizationSchema = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "MeetYouLive",
    url: "https://meetyoulive.net",
    logo: "https://meetyoulive.net/logo.svg",
    description:
      "Plataforma de citas y streaming en vivo para crear conexiones reales.",
    sameAs: [
      "https://twitter.com/meetyoulive",
      "https://facebook.com/meetyoulive",
      "https://instagram.com/meetyoulive",
    ],
  };

  const websiteSchema = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "MeetYouLive",
    url: "https://meetyoulive.net",
    description:
      "Conoce personas, haz match, transmite en vivo y conecta de manera auténtica.",
    potentialAction: {
      "@type": "SearchAction",
      target: "https://meetyoulive.net/search?q={search_term_string}",
      "query-input": "required name=search_term_string",
    },
  };

  return (
    <html lang="es">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap"
          rel="stylesheet"
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(organizationSchema),
          }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(websiteSchema),
          }}
        />
      </head>
      <body>
        <Providers>
          <ServiceWorkerRegistration />
          <OfflineIndicator />
          <InstallPrompt />
          <NavbarWrapper />
          <MainContentWrapper>
            {children}
          </MainContentWrapper>
          <BottomNavWrapper />
          <IncomingCallNotification />
          <FloatingGoLiveButton />
        </Providers>
      </body>
    </html>
  );
}
