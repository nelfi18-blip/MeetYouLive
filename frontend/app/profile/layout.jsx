// All member profiles — including links to individual accounts — are
// session-gated. Search engines must not index names, photos or profile URLs.
export const metadata = {
  robots: {
    index: false,
    follow: false,
    googleBot: { index: false, follow: false },
  },
};

export default function MemberProfileLayout({ children }) {
  return children;
}
