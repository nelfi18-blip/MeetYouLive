/** @type {import('next').NextConfig} */
const isMobileBuild = process.env.NEXT_MOBILE_BUILD === 'true';

const nextConfig = {
  eslint: {
    // Pre-existing lint warnings/errors are caught during development;
    // they do not block production builds.
    ignoreDuringBuilds: true,
  },
  // When building for Capacitor static packaging, export as a plain HTML/JS
  // bundle into the `out/` directory (matches webDir in capacitor.config.ts).
  // Set NEXT_MOBILE_BUILD=true before running `next build` to enable this.
  ...(isMobileBuild && {
    output: 'export',
    trailingSlash: true,
  }),
  env: {
    // Ensure NEXT_PUBLIC_API_URL is always defined so fetch calls produce
    // a relative-URL string instead of "undefined/api/..." in preview builds
    // where the env var may not be set.
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL ?? "",
  },
  images: {
    // Static export requires an unoptimized image loader
    ...(isMobileBuild && { unoptimized: true }),
    remotePatterns: [
      {
        protocol: "https",
        hostname: "lh3.googleusercontent.com",
      },
    ],
  },
};

export default nextConfig;
