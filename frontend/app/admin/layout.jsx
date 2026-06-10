import AdminShell from "./AdminShell";
import { CANONICAL_SITE_URL } from "@/lib/site";

export const metadata = {
  title: "MeetYouLive Admin",
  robots: {
    index: false,
    follow: false,
    googleBot: {
      index: false,
      follow: false,
    },
  },
  alternates: {
    canonical: CANONICAL_SITE_URL,
  },
};

export default function AdminLayout({ children }) {
  return <AdminShell>{children}</AdminShell>;
}
