import LegalPage from "@/components/LegalPage";
import { publicPageMetadata } from "@/lib/pageMetadata";

export const metadata = publicPageMetadata({
  title: "Law Enforcement Requests - MeetYouLive",
  description:
    "MeetYouLive guidelines for law enforcement and government authorities requesting user information, including emergency disclosure and preservation requests.",
  path: "/law-enforcement",
});

export default function Page() {
  return <LegalPage policyKey="lawEnforcement" />;
}
