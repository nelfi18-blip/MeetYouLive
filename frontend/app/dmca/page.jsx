import LegalPage from "@/components/LegalPage";
import { publicPageMetadata } from "@/lib/pageMetadata";

export const metadata = publicPageMetadata({
  title: "DMCA Policy - MeetYouLive",
  description:
    "MeetYouLive DMCA policy for copyright notices, takedown requests and repeat infringement rules.",
  path: "/dmca",
});

export default function Page() {
  return <LegalPage policyKey="dmca" />;
}
