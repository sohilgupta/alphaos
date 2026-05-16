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
  // pdf-parse was removed: it's not imported anywhere, and v2.x has
  // `type: module` which makes Vercel's serverless bundler choke when
  // listed here ("require() resolves to a EcmaScript module").
  serverExternalPackages: ['yahoo-finance2', 'pdfjs-dist'],

  // Disable Vercel edge caching on app HTML responses.
  //
  // The default Vercel CDN cheerfully caches HTML responses for hours
  // unless told otherwise. When we push new CSS chunks, the cached HTML
  // keeps pointing at the *old* chunk URLs, so users see stale styling
  // (dark cards in light mode, missing theme variables, etc.) until the
  // edge cache eventually expires. This kills that behavior for HTML.
  // Hashed _next/static/* assets are exempted via the source pattern and
  // keep their long-lived cache headers because their URL changes with
  // content.
  async headers() {
    return [
      {
        source: '/:path((?!_next/static|favicon|.*\\..*).*)',
        headers: [
          { key: 'Cache-Control', value: 'no-store, must-revalidate' },
          { key: 'CDN-Cache-Control', value: 'no-store' },
          { key: 'Vercel-CDN-Cache-Control', value: 'no-store' },
        ],
      },
    ];
  },
};

export default nextConfig;
