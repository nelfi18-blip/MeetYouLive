// Server-component layout for the isolated MYL World & Beyond gift
// animations preview. This route is intentionally kept out of search
// results and out of the public-facing product — see page.jsx for the
// NODE_ENV guard that fully disables rendering in production.
export const metadata = {
  title: "MYL World & Beyond — Preview",
  robots: {
    index: false,
    follow: false,
    googleBot: {
      index: false,
      follow: false,
    },
  },
};

export default function GiftAnimationsPreviewLayout({ children }) {
  return children;
}
