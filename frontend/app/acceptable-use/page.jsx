import LegalPage from "@/components/LegalPage";
import { publicPageMetadata } from "@/lib/pageMetadata";

export const metadata = publicPageMetadata({
  title: "MeetYouLive Acceptable Use Policy",
  description:
    "MeetYouLive acceptable use policy for safe, legal and respectful platform activity.",
  path: "/acceptable-use",
});

export default function Page() {
  return <LegalPage policyKey="acceptableUse" />;
}
