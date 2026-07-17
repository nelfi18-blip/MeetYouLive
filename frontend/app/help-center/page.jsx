import LegalPage from "@/components/LegalPage";
import { publicPageMetadata } from "@/lib/pageMetadata";

export const metadata = publicPageMetadata({
  title: "Help Center - MeetYouLive",
  description:
    "MeetYouLive help center with FAQs for account, profile, coins, Premium, VIP, Creator, Live, chat, video calls, payments and safety.",
  path: "/help-center",
});

export default function Page() {
  return <LegalPage policyKey="helpCenter" />;
}
