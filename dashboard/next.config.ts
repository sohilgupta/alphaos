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
  // Keep these packages un-bundled so their internal file paths
  // (pdfjs worker, canvas bindings) remain valid at runtime on Vercel.
  serverExternalPackages: ['yahoo-finance2', 'pdf-parse', 'pdfjs-dist'],
};

export default nextConfig;
