import LegalPage from "@/components/LegalPage";
import { publicPageMetadata } from "@/lib/pageMetadata";

export const metadata = publicPageMetadata({
  title: "Cookie Policy - MeetYouLive",
  description:
    "MeetYouLive cookie policy covering session, security, preferences, analytics and cookie management.",
  path: "/cookies",
});

export default function Page() {
  return <LegalPage policyKey="cookies" />;
}
