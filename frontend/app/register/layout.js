import { canonicalUrl } from "@/lib/site";

export const metadata = {
  alternates: {
    canonical: canonicalUrl("/register"),
  },
  openGraph: {
    url: canonicalUrl("/register"),
  },
};

export default function RegisterLayout({ children }) {
  return children;
}
