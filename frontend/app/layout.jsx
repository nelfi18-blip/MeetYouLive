import "./globals.css";
import Providers from "./providers";
import NavbarWrapper from "../components/NavbarWrapper";

export const metadata = {
  title: "MeetYouLive",
  description: "Dating, Live streaming y VR",
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
        </Providers>
      </body>
    </html>
  );
}
