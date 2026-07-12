export const LEGAL_POLICIES = [
  { key: "terms", href: "/terms" },
  { key: "privacy", href: "/privacy" },
  { key: "acceptableUse", href: "/acceptable-use" },
  { key: "communityGuidelines", href: "/community-guidelines" },
  { key: "creatorPolicy", href: "/creator-policy" },
  { key: "paymentsRefunds", href: "/refund", aliases: ["/refunds", "/payments-refunds"] },
  { key: "dmca", href: "/dmca" },
  { key: "safetyModeration", href: "/safety-moderation" },
];

export const LEGAL_ROUTE_KEYS = LEGAL_POLICIES.flatMap((policy) => [policy.href, ...(policy.aliases || [])]);

export function getLegalPolicyByKey(key) {
  return LEGAL_POLICIES.find((policy) => policy.key === key);
}
