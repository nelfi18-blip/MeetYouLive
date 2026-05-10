/**
 * Sitemap generator for MeetYouLive
 * Includes only public routes accessible to all users
 * Referenced in robots.txt
 */

export default function sitemap() {
  const baseUrl = 'https://meetyoulive.net';
  
  // Public routes only - no auth required
  const routes = [
    '',              // Homepage
    '/login',        // Login page
    '/register',     // Registration page
    '/terms',        // Terms of service
    '/privacy',      // Privacy policy
    '/refunds',      // Refund policy
  ];
  
  return routes.map((route) => ({
    url: `${baseUrl}${route}`,
    lastModified: new Date(),
    changeFrequency: route === '' ? 'daily' : 'monthly',
    priority: route === '' ? 1.0 : 0.8,
  }));
}
