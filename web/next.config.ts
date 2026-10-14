import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Disable development indicators (hides the small Next.js icon in bottom-left corner)
  devIndicators: false,
  // Turbopack: uses a different HMR protocol that doesn't trigger disruptive page refreshes
  turbopack: {},
  // Allow images from common sources
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'images.unsplash.com' },
      { protocol: 'https', hostname: '**.githubusercontent.com' },
      { protocol: 'https', hostname: '**.googleusercontent.com' },
    ],
  },
  // Disable TypeScript and ESLint errors during development
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
