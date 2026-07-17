export const LEGAL_POLICIES = [
  { key: "about", href: "/about" },
  { key: "howItWorks", href: "/how-it-works" },
  { key: "security", href: "/security" },
  { key: "communityGuidelines", href: "/community-guidelines" },
  { key: "privacy", href: "/privacy" },
  { key: "terms", href: "/terms" },
  { key: "cookies", href: "/cookies" },
  { key: "paymentsRefunds", href: "/refund", aliases: ["/refunds", "/payments-refunds"] },
  { key: "contentPolicy", href: "/content-policy" },
  { key: "creatorPolicy", href: "/creator-policy" },
  { key: "helpCenter", href: "/help-center" },
  { key: "contact", href: "/contact" },
  { key: "acceptableUse", href: "/acceptable-use" },
  { key: "dmca", href: "/dmca" },
  { key: "safetyModeration", href: "/safety-moderation" },
];

export const LEGAL_ROUTE_KEYS = LEGAL_POLICIES.flatMap((policy) => [policy.href, ...(policy.aliases || [])]);

export function getLegalPolicyByKey(key) {
  return LEGAL_POLICIES.find((policy) => policy.key === key);
}
