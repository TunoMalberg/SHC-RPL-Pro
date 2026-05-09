import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * Per-request CSP with nonce (F-02 fix, revised).
 *
 * Next.js (App Router) emits inline <script> tags for streaming / RSC
 * hydration. A CSP of `script-src 'self'` without `'unsafe-inline'` or a
 * nonce blocks these, which broke the live app (empty page after SSR).
 *
 * Solution: generate a cryptographically-random nonce per request, put it
 * into the CSP via `'nonce-<value>' 'strict-dynamic'`, and forward it to
 * Next.js via the `x-nonce` request header so that Next.js attaches the
 * nonce to every inline script it emits.
 *
 * `'strict-dynamic'` means "any script loaded by a nonce'd script is also
 * trusted", which lets Next.js's chunk loader work without us having to
 * allowlist every chunk hash.
 *
 * Security benefits are preserved:
 *   - External scripts still blocked (no third-party JS)
 *   - Inline scripts without nonce still blocked (XSS still contained)
 *   - object-src / frame-ancestors / base-uri still locked down
 */

export function middleware(request: NextRequest) {
  // Dev: skip CSP and keep permissive CORS for Design-Mode tooling.
  if (process.env.NODE_ENV === 'development') {
    return NextResponse.next();
  }

  // Generate a fresh nonce per request (base64 of 16 random bytes).
  const nonceBytes = new Uint8Array(16);
  crypto.getRandomValues(nonceBytes);
  const nonce = btoa(String.fromCharCode(...nonceBytes));

  const csp = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    "connect-src 'self'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
  ].join('; ');

  // Forward nonce to the Next.js runtime so it can attach it to inline
  // <script> tags it emits for hydration / RSC streaming.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('content-security-policy', csp);

  const response = NextResponse.next({
    request: { headers: requestHeaders },
  });
  response.headers.set('content-security-policy', csp);
  return response;
}

export const config = {
  // Apply to everything except static assets / images (which don't render
  // HTML and don't need a per-request nonce). Next.js will still serve
  // static files with the site-wide headers configured in next.config.js.
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|icons/|.*\\.(?:png|jpg|jpeg|gif|svg|webp|ico|woff2?|ttf|otf|eot|css|js)$).*)',
  ],
};