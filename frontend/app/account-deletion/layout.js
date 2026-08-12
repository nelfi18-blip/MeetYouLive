import { canonicalUrl } from "@/lib/site";

export const metadata = {
  title: "Account Deletion - MeetYouLive",
  description:
    "How to request deletion of your MeetYouLive account and personal data, and how to get help.",
  alternates: { canonical: canonicalUrl("/account-deletion") },
  openGraph: { url: canonicalUrl("/account-deletion") },
};

export default function Layout({ children }) {
  return children;
}
