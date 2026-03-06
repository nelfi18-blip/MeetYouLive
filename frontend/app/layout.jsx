import "./globals.css";

export const metadata = {
  title: "MeetYouLive",
  description: "Dating, Live streaming y VR",
};

export default function RootLayout({ children }) {
  return (
    <html lang="es">
      <body>
        {children}
      </body>
    </html>
  );
}
