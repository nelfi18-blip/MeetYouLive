import "./globals.css";
import Providers from "./providers";

export const metadata = {
  title: "MeetYouLive",
  description: "Meet people live",
};

export default function RootLayout({ children }) {
  return (
    <html lang="es">
      <body>
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  );
}
