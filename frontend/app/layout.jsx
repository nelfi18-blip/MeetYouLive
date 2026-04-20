import "./globals.css";
import Providers from "./providers";
import NavbarWrapper from "../components/NavbarWrapper";
import IncomingCallNotification from "../components/IncomingCallNotification";

export const metadata = {
  title: "MeetYouLive 🔥 | Citas, Video en Vivo y Conexiones Reales",
  description:
    "Descubre personas reales cerca de ti, haz match y conecta en video en vivo. 💖 Envía regalos, chatea y gana dinero como creador en MeetYouLive.",
  manifest: "/site.webmanifest",
  icons: {
    icon: "/favicon.ico",
    apple: "/apple-touch-icon.png",
    shortcut: "/icon.png",
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
    title: "MeetYouLive 💖",
    description:
      "Haz match, conecta en vivo y gana dinero como creador.",
    url: "https://meetyoulive.net",
    siteName: "MeetYouLive",
    images: [
      {
        url: "/logo.png",
        width: 1200,
        height: 630,
      },
    ],
    locale: "es_US",
    type: "website",
  },
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
          <NavbarWrapper />
          <main className="main-content">
            {children}
          </main>
          <IncomingCallNotification />
        </Providers>
      </body>
    </html>
  );
}
