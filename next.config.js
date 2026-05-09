/** @type {import('next').NextConfig} */

/*
 * Security headers for intranet / bank deployment.
 * Addresses audit finding F-02 (CWE-693 / CWE-1021, OWASP A05:2021,
 * ASVS V14.4).
 *
 * CSP note: the Content-Security-Policy header is set dynamically per
 * request in `src/middleware.ts` (with a fresh nonce so that Next.js's
 * inline hydration / RSC streaming <script> tags are allowed to execute
 * while still blocking any other inline script). The remaining headers
 * below are static and apply to every response.
 */
const SECURITY_HEADERS = [
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=63072000; includeSubDomains; preload',
  },
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
  },
  { key: 'X-DNS-Prefetch-Control', value: 'off' },
];

const nextConfig = {
  // Use standalone output only for Docker/self-hosted builds (not Vercel)
  ...(process.env.VERCEL ? {} : { output: 'standalone' }),
  distDir: process.env.VERCEL ? '.next' : (process.env.BUILD_DIR || '.next-build'),
  webpack: (config, { isServer, webpack }) => {
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        net: false,
        tls: false,
        https: false,
        http: false,
        stream: false,
        zlib: false,
        path: false,
        crypto: false,
      };
      // Replace node: protocol imports with empty modules for browser builds
      config.plugins.push(
        new webpack.NormalModuleReplacementPlugin(/^node:/, (resource) => {
          resource.request = resource.request.replace(/^node:/, '');
        })
      );
    }
    return config;
  },
  async headers() {
    // Development: keep permissive CORS so Design-Mode tooling works.
    // Production: enforce bank-grade security headers (F-02).
    if (process.env.NODE_ENV === 'development') {
      return [
        {
          source: '/:path*',
          headers: [
            { key: 'Access-Control-Allow-Origin', value: '*' },
            { key: 'Access-Control-Allow-Methods', value: 'GET, POST, PUT, DELETE, OPTIONS' },
            { key: 'Access-Control-Allow-Headers', value: '*' },
          ],
        },
      ];
    }
    return [
      {
        source: '/:path*',
        headers: SECURITY_HEADERS,
      },
    ];
  },
  images: {
    unoptimized: true,
    remotePatterns: [
      { protocol: 'https', hostname: 'source.unsplash.com', pathname: '/**' },
      { protocol: 'https', hostname: 'images.unsplash.com', pathname: '/**' },
      { protocol: 'https', hostname: 'ext.same-assets.com', pathname: '/**' },
      { protocol: 'https', hostname: 'ugc.same-assets.com', pathname: '/**' },
    ],
  },
  // F-05 (OWASP A05:2021, CWE-489/1188): strict CI/build validation.
  // TypeScript + ESLint errors must fail the build so that class-of-bugs
  // regressions (XSS, CSV-Injection, any-typed export helpers, etc.) cannot
  // ship to production unnoticed.
  typescript: {
    ignoreBuildErrors: false,
  },
  eslint: {
    ignoreDuringBuilds: false,
  },
};

module.exports = nextConfig;