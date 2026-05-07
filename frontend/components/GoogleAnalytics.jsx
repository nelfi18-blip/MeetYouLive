"use client";

import Script from "next/script";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect } from "react";

// Google Analytics 4 component
// Set NEXT_PUBLIC_GA_MEASUREMENT_ID in your environment variables
export default function GoogleAnalytics() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const GA_MEASUREMENT_ID = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;

  useEffect(() => {
    if (!GA_MEASUREMENT_ID) return;

    const url = pathname + (searchParams?.toString() ? `?${searchParams.toString()}` : "");

    // Send pageview when route changes
    if (typeof window !== "undefined" && window.gtag) {
      window.gtag("config", GA_MEASUREMENT_ID, {
        page_path: url,
      });
    }
  }, [pathname, searchParams, GA_MEASUREMENT_ID]);

  // Don't render if no GA_MEASUREMENT_ID is set
  if (!GA_MEASUREMENT_ID) {
    return null;
  }

  return (
    <>
      <Script
        strategy="afterInteractive"
        src={`https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`}
      />
      <Script
        id="google-analytics"
        strategy="afterInteractive"
        dangerouslySetInnerHTML={{
          __html: `
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', '${GA_MEASUREMENT_ID}', {
              page_path: window.location.pathname,
            });
          `,
        }}
      />
    </>
  );
}

// Helper functions to track custom events
export const trackEvent = (eventName, eventParams = {}) => {
  if (typeof window !== "undefined" && window.gtag) {
    window.gtag("event", eventName, eventParams);
  }
};

// Pre-configured event trackers
export const trackRegistration = (method = "email") => {
  trackEvent("sign_up", { method });
};

export const trackLogin = (method = "email") => {
  trackEvent("login", { method });
};

export const trackPurchase = (value, currency = "USD", items = []) => {
  trackEvent("purchase", {
    currency,
    value,
    items,
  });
};

export const trackStreamView = (streamId, creatorName) => {
  trackEvent("view_stream", {
    stream_id: streamId,
    creator: creatorName,
  });
};

export const trackGiftSent = (giftName, value) => {
  trackEvent("send_gift", {
    gift_name: giftName,
    value,
  });
};

export const trackMatch = () => {
  trackEvent("match_made");
};

export const trackGoLive = () => {
  trackEvent("go_live");
};
