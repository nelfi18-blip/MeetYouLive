/**
 * Sitemap generator for MeetYouLive
 * Includes only public routes accessible to all users
 * Referenced in robots.txt
 */
import { CANONICAL_SITE_URL } from "@/lib/site";

export default function sitemap() {
  // Public routes only - no auth required
  const routes = [
    '',              // Homepage
    '/login',        // Login page
    '/register',     // Registration page
    '/about',
    '/how-it-works',
    '/legal',        // Legal center
    '/security',
    '/community-guidelines',
    '/terms',        // Terms of service
    '/privacy',      // Privacy policy
    '/cookies',
    '/acceptable-use',
    '/content-policy',
    '/creator-policy',
    '/help-center',
    '/contact',
    '/refund',
    '/payments-refunds', // Payments and refund policy
    '/dmca',
    '/safety-moderation' 
  ];
  
  return routes.map((route) => ({
    url: `${CANONICAL_SITE_URL}${route}`,
    lastModified: new Date(),
    changeFrequency: route === '' ? 'daily' : 'monthly',
    priority: route === '' ? 1.0 : 0.8,
  }));
}
