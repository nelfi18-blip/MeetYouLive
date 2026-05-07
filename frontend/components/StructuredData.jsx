// Structured Data (JSON-LD) for rich snippets in Google search results
// This helps Google understand your website better and show enhanced results

export default function StructuredData() {
  const structuredData = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebApplication",
        "name": "MeetYouLive",
        "applicationCategory": "SocialNetworkingApplication",
        "operatingSystem": "Web, iOS, Android",
        "offers": {
          "@type": "Offer",
          "price": "0",
          "priceCurrency": "USD",
        },
        "aggregateRating": {
          "@type": "AggregateRating",
          "ratingValue": "4.5",
          "ratingCount": "1200",
          "bestRating": "5",
          "worstRating": "1",
        },
        "description": "Conoce personas, mira directos en vivo y conecta en tiempo real. App de citas con streaming en vivo.",
        "url": "https://www.meetyoulive.net",
        "screenshot": "https://www.meetyoulive.net/og-image.png",
        "featureList": [
          "Video streaming en vivo",
          "Matches y swipe",
          "Chat en tiempo real",
          "Regalos virtuales",
          "Contenido exclusivo",
          "Videollamadas privadas",
        ],
      },
      {
        "@type": "Organization",
        "name": "MeetYouLive",
        "url": "https://www.meetyoulive.net",
        "logo": "https://www.meetyoulive.net/logo.svg",
        "sameAs": [
          "https://www.facebook.com/meetyoulive",
          "https://www.instagram.com/meetyoulive",
          "https://twitter.com/meetyoulive",
          "https://www.tiktok.com/@meetyoulive",
        ],
        "contactPoint": {
          "@type": "ContactPoint",
          "contactType": "Customer Support",
          "email": "support@meetyoulive.net",
          "availableLanguage": ["Spanish", "English", "Portuguese"],
        },
      },
      {
        "@type": "WebSite",
        "name": "MeetYouLive",
        "url": "https://www.meetyoulive.net",
        "potentialAction": {
          "@type": "SearchAction",
          "target": "https://www.meetyoulive.net/feed?q={search_term_string}",
          "query-input": "required name=search_term_string",
        },
      },
      {
        "@type": "BreadcrumbList",
        "itemListElement": [
          {
            "@type": "ListItem",
            "position": 1,
            "name": "Inicio",
            "item": "https://www.meetyoulive.net",
          },
          {
            "@type": "ListItem",
            "position": 2,
            "name": "Feed",
            "item": "https://www.meetyoulive.net/feed",
          },
          {
            "@type": "ListItem",
            "position": 3,
            "name": "Registrarse",
            "item": "https://www.meetyoulive.net/register",
          },
        ],
      },
    ],
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
    />
  );
}
