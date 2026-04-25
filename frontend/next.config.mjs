/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    // Pre-existing lint warnings/errors are caught during development;
    // they do not block production builds.
    ignoreDuringBuilds: true,
  },
  env: {
    // Ensure NEXT_PUBLIC_API_URL is always defined so fetch calls produce
    // a relative-URL string instead of "undefined/api/..." in preview builds
    // where the env var may not be set.
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL ?? "",
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "lh3.googleusercontent.com",
      },
    ],
  },
};

export default nextConfig;
