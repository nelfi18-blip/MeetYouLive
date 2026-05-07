import "./globals.css";
import Providers from "./providers";
import NavbarWrapper from "../components/NavbarWrapper";
import BottomNavWrapper from "../components/BottomNavWrapper";
import IncomingCallNotification from "../components/IncomingCallNotification";
import FloatingGoLiveButton from "../components/FloatingGoLiveButton";
import ServiceWorkerRegistration from "../components/ServiceWorkerRegistration";
import OfflineIndicator from "../components/OfflineIndicator";
import InstallPrompt from "../components/InstallPrompt";
import GoogleAnalytics from "../components/GoogleAnalytics";
import FacebookPixel from "../components/FacebookPixel";
import StructuredData from "../components/StructuredData";

export const metadata = {
  metadataBase: new URL("https://www.meetyoulive.net"),
  title: {
    default: "MeetYouLive - Conecta en vivo, haz match y gana dinero",
    template: "%s | MeetYouLive",
  },
  description: "Conoce personas, mira directos en vivo y conecta en tiempo real. App de citas con streaming en vivo. Los creadores pueden ganar dinero con sus transmisiones y contenido exclusivo.",
  applicationName: "MeetYouLive",
  authors: [{ name: "MeetYouLive" }],
  generator: "Next.js",
  manifest: "/manifest.json",
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
    "meetyoulive",
    "app de citas",
    "video chat",
    "live streaming",
    "streaming en vivo",
    "citas online",
    "conocer personas",
    "app para ligar",
    "videollamadas",
    "ganar dinero streaming",
    "creador de contenido",
    "monetizar directos",
    "regalos virtuales",
    "app de citas en español",
    "dating app",
    "social app",
  ],
  openGraph: {
    title: "MeetYouLive - Conecta en vivo, haz match y gana dinero",
    description: "Conoce personas, mira directos en vivo y conecta en tiempo real. App de citas con streaming en vivo. Los creadores pueden ganar dinero con sus transmisiones.",
    url: "https://www.meetyoulive.net",
    siteName: "MeetYouLive",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 835,
        alt: "MeetYouLive - Conecta en vivo",
      },
    ],
    locale: "es_ES",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "MeetYouLive - Conecta en vivo, haz match y gana dinero",
    description: "Conoce personas, mira directos en vivo y conecta en tiempo real. App de citas con streaming en vivo.",
    images: ["/og-image.png"],
    creator: "@meetyoulive",
    site: "@meetyoulive",
  },
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
  alternates: {
    canonical: "https://www.meetyoulive.net",
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
  return (
    <html lang="es">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <StructuredData />
        <GoogleAnalytics />
        <FacebookPixel />
        <Providers>
          <ServiceWorkerRegistration />
          <OfflineIndicator />
          <InstallPrompt />
          <NavbarWrapper />
          <main className="main-content">
            {children}
          </main>
          <BottomNavWrapper />
          <IncomingCallNotification />
          <FloatingGoLiveButton />
        </Providers>
      </body>
    </html>
  );
}
