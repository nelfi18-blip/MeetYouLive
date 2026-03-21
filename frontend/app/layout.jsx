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
