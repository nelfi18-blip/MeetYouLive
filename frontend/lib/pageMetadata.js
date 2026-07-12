import { canonicalUrl } from "@/lib/site";

export function publicPageMetadata({ title, description, path }) {
  const url = canonicalUrl(path);

  return {
    title,
    description,
    alternates: {
      canonical: url,
    },
    openGraph: {
      title,
      description,
      url,
      siteName: "MeetYouLive",
      type: "website",
      images: [
        {
          url: "/og-image.png",
          width: 1200,
          height: 835,
          alt: "MeetYouLive",
        },
      ],
    },
    icons: {
      icon: "/favicon.ico",
      shortcut: "/favicon.ico",
      apple: "/apple-touch-icon.png",
    },
  };
}
