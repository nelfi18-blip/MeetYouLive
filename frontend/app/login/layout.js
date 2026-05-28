import { canonicalUrl } from "@/lib/site";

export const metadata = {
  alternates: {
    canonical: canonicalUrl("/login"),
  },
  openGraph: {
    url: canonicalUrl("/login"),
  },
};

export default function LoginLayout({ children }) {
  return children;
}
