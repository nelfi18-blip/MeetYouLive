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
    // Google OAuth client IDs are public identifiers. Android native Google
    // Sign-In must reuse the working NextAuth web client ID unless an
    // explicit public override is provided.
    NEXT_PUBLIC_GOOGLE_WEB_CLIENT_ID:
      process.env.NEXT_PUBLIC_GOOGLE_WEB_CLIENT_ID || process.env.GOOGLE_CLIENT_ID || "",
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "lh3.googleusercontent.com",
      },
      {
        protocol: "https",
        hostname: "meetyoulive.onrender.com",
      },
      {
        protocol: "https",
        hostname: "meetyoulive.net",
      },
      {
        protocol: "https",
        hostname: "res.cloudinary.com",
      },
      {
        protocol: "https",
        hostname: "firebasestorage.googleapis.com",
      },
    ],
  },
};

export default nextConfig;
