/** @type {import('next').NextConfig} */

/*
 * Security headers for intranet / bank deployment.
 * Addresses audit finding F-02 (CWE-693 / CWE-1021, OWASP A05:2021,
 * ASVS V14.4). Rolled out enforcing (not report-only) because the app has
 *   - no inline <script> blocks (F-04 fix removed the last one) and
 *   - no third-party JS at runtime.
 * Tailwind requires `style-src 'unsafe-inline'` for its generated <style>
 * elements; this is accepted trade-off per Next.js defaults.
 */
const SECURITY_HEADERS = [
  {
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self'",
      "script-src 'self'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "font-src 'self' data:",
      "connect-src 'self'",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "object-src 'none'",
    ].join('; '),
  },
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