import LegalPage from "@/components/LegalPage";
import { publicPageMetadata } from "@/lib/pageMetadata";

export const metadata = publicPageMetadata({
  title: "Account Deletion - MeetYouLive",
  description:
    "How to request deletion of your MeetYouLive account and personal data, what is removed, what may be retained, and how to get help.",
  path: "/account-deletion",
});

export default function Page() {
  return <LegalPage policyKey="accountDeletion" />;
}
