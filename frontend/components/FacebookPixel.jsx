"use client";

import Script from "next/script";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect } from "react";

// Facebook Pixel component
// Set NEXT_PUBLIC_FACEBOOK_PIXEL_ID in your environment variables
export default function FacebookPixel() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const PIXEL_ID = process.env.NEXT_PUBLIC_FACEBOOK_PIXEL_ID;

  useEffect(() => {
    if (!PIXEL_ID) return;

    // Track page views when route changes
    if (typeof window !== "undefined" && window.fbq) {
      window.fbq("track", "PageView");
    }
  }, [pathname, searchParams, PIXEL_ID]);

  // Don't render if no PIXEL_ID is set
  if (!PIXEL_ID) {
    return null;
  }

  return (
    <Script
      id="facebook-pixel"
      strategy="afterInteractive"
      dangerouslySetInnerHTML={{
        __html: `
          !function(f,b,e,v,n,t,s)
          {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
          n.callMethod.apply(n,arguments):n.queue.push(arguments)};
          if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
          n.queue=[];t=b.createElement(e);t.async=!0;
          t.src=v;s=b.getElementsByTagName(e)[0];
          s.parentNode.insertBefore(t,s)}(window, document,'script',
          'https://connect.facebook.net/en_US/fbevents.js');
          fbq('init', '${PIXEL_ID}');
          fbq('track', 'PageView');
        `,
      }}
    />
  );
}

// Helper functions to track custom events
export const trackFBEvent = (eventName, eventParams = {}) => {
  if (typeof window !== "undefined" && window.fbq) {
    window.fbq("track", eventName, eventParams);
  }
};

// Pre-configured Facebook Pixel events
export const trackFBRegistration = () => {
  trackFBEvent("CompleteRegistration");
};

export const trackFBPurchase = (value, currency = "USD") => {
  trackFBEvent("Purchase", {
    value,
    currency,
  });
};

export const trackFBAddToCart = (value, currency = "USD") => {
  trackFBEvent("AddToCart", {
    value,
    currency,
  });
};

export const trackFBViewContent = (contentType, contentId) => {
  trackFBEvent("ViewContent", {
    content_type: contentType,
    content_id: contentId,
  });
};

export const trackFBLead = () => {
  trackFBEvent("Lead");
};
