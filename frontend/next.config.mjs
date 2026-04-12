/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    // Pre-existing lint warnings/errors are caught during development;
    // they do not block production builds.
    ignoreDuringBuilds: true,
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
