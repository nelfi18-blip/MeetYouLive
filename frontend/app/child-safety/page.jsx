import LegalPage from "@/components/LegalPage";
import { publicPageMetadata } from "@/lib/pageMetadata";

export const metadata = publicPageMetadata({
  title: "Child Safety Standards - MeetYouLive",
  description:
    "MeetYouLive Child Safety Standards: zero tolerance for Child Sexual Abuse and Exploitation (CSAE) and Child Sexual Abuse Material (CSAM), reporting and contact information.",
  path: "/child-safety",
});

export default function Page() {
  return <LegalPage policyKey="childSafety" />;
}
