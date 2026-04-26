import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow external images (news thumbnails, company logos)
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '**' },
    ],
  },
  // Empty turbopack config silences the Turbopack/webpack conflict warning
  turbopack: {},
  // Mark yahoo-finance2 as a server-only package
  serverExternalPackages: ['yahoo-finance2'],
};

export default nextConfig;
