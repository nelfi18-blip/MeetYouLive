import Providers from "./providers";
import InstallPrompt from "../components/InstallPrompt";

export const metadata = {
  title: "MeetYouLive",
};

export default function RootLayout({ children }) {
  return (
    <html lang="es">
      <body>
        <Providers>
          <InstallPrompt />
          {children}
        </Providers>
      </body>
    </html>
  );
}
