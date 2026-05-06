import "./globals.css";
import Providers from "./providers";
import NavbarWrapper from "../components/NavbarWrapper";
import BottomNavWrapper from "../components/BottomNavWrapper";
import IncomingCallNotification from "../components/IncomingCallNotification";
import FloatingGoLiveButton from "../components/FloatingGoLiveButton";
import ServiceWorkerRegistration from "../components/ServiceWorkerRegistration";
import OfflineIndicator from "../components/OfflineIndicator";
import InstallPrompt from "../components/InstallPrompt";

export const metadata = {
  metadataBase: new URL("https://meetyoulive.net"),
  title: "MeetYouLive",
  description: "live dating and streaming app",
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
    "ganar dinero streaming",
    "video en vivo citas",
  ],
  openGraph: {
    title: "MeetYouLive",
    description:
      "Haz match, conecta en vivo y gana dinero como creador.",
    url: "https://meetyoulive.net",
    siteName: "MeetYouLive",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 835,
        alt: "MeetYouLive - Conecta en vivo",
      },
    ],
    locale: "es_US",
    type: "website",
  },
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
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
