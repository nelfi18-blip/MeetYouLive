import Providers from "./providers";
import InstallPrompt from "../components/InstallPrompt";
import NavbarWrapper from "../components/NavbarWrapper";
import "./globals.css";

export const metadata = {
  title: "MeetYouLive",
  description: "Plataforma de streaming en vivo",
};

export default function RootLayout({ children }) {
  return (
    <html lang="es">
      <body>
        <Providers>
          <InstallPrompt />
          <NavbarWrapper />
          <main className="main-content">{children}</main>
        </Providers>
      </body>
    </html>
  );
}
