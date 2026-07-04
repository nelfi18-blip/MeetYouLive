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
    '/legal',        // Legal center
    '/terms',        // Terms of service
    '/privacy',      // Privacy policy
    '/acceptable-use',
    '/community-guidelines',
    '/creator-policy',
    '/refunds',      // Payments and refund policy
    '/payments-refunds',
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
