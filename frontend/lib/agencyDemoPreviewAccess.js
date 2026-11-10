// Exact branch-scoped Preview demo. Not a passwordless backend login.
// Production and every other branch must remain protected.
export const AGENCY_DEMO_PATH = "/dev/agency-demo";
export const AGENCY_DEMO_BRANCH = "fix/creator-only-agency-application-2026-11-10";

export function isAgencyDemoPreviewEnabled({
  environment = process.env.VERCEL_ENV,
  branch = process.env.VERCEL_GIT_COMMIT_REF,
} = {}) {
  return environment === "preview" && branch === AGENCY_DEMO_BRANCH;
}
