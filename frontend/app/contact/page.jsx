import ContactPageContent from "@/components/ContactPageContent";
import { publicPageMetadata } from "@/lib/pageMetadata";

export const metadata = publicPageMetadata({
  title: "Contact - MeetYouLive",
  description:
    "Contact MEETYOULIVE TECHNOLOGIES LLC for support, billing questions, account help and website verification information.",
  path: "/contact",
});

export default function ContactPage() {
  return <ContactPageContent />;
}
