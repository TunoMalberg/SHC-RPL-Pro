import type { Metadata } from "next";
import { headers } from "next/headers";
import localFont from "next/font/local";
import "./globals.css";
import ClientBody from "./ClientBody";

/*
 * Skeena Corporate Typeface (SHC Markenstilhandbuch).
 * Self-hosted via next/font/local — no Google-Fonts CDN, no external
 * request from the browser. Required for the bank-intranet deployment
 * where egress to fonts.gstatic.com is blocked and the CSP disallows
 * third-party script/style origins. The TTFs live in /public/fonts/
 * (referenced by the PDF/HTML export pipeline via runtime fetch); the
 * relative paths below let Next.js fingerprint and preload them for the
 * browser without duplicating the bytes in src/.
 */
const skeena = localFont({
  variable: "--font-skeena",
  display: "swap",
  src: [
    { path: "../../public/fonts/Skeena-Regular.ttf",    weight: "400", style: "normal" },
    { path: "../../public/fonts/Skeena-Italic.ttf",     weight: "400", style: "italic" },
    { path: "../../public/fonts/Skeena-Bold.ttf",       weight: "700", style: "normal" },
    { path: "../../public/fonts/Skeena-BoldItalic.ttf", weight: "700", style: "italic" },
  ],
});

export const metadata: Metadata = {
  title: "Ruhestandsplaner Pro — Planung & Simulation",
  description:
    "Professionelle Ruhestandsplanung mit Drei-Topf-Portfoliomodell, Monte-Carlo-Simulation und historischer Rückrechnung.",
};

/*
 * CSP nonce support requires dynamic rendering. The root layout reads the
 * `x-nonce` request header that `src/middleware.ts` sets, which opts this
 * route (and therefore the entire app) into per-request rendering. Next.js
 * then automatically attaches the same nonce to every <script> tag it
 * emits (inline RSC-streaming blocks + external chunk <script src="..."/>
 * tags), which is what the CSP `'nonce-<value>' 'strict-dynamic'` policy
 * requires.
 *
 * Without this, the page was statically pre-rendered at build time and the
 * nonce in the per-request CSP never matched the empty `nonce` attributes
 * in the cached HTML — every chunk load was blocked and React never
 * hydrated, so tabs/inputs were not clickable.
 */
export const dynamic = "force-dynamic";

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Consuming headers() forces dynamic rendering and lets Next.js
  // propagate the nonce from x-nonce to its generated <script> tags.
  await headers();

  return (
    <html lang="de" className={skeena.variable}>
      <body suppressHydrationWarning className="antialiased font-sans">
        <ClientBody>{children}</ClientBody>
      </body>
    </html>
  );
}
/*
 * F-04 (Audit 06.05.2026, CWE-940): The previous root-layout carried an inline
 * script that posted `location.origin + pathname + hash` to `window.parent`
 * with a wildcard target ('*'). It was a leftover of the original Same.dev
 * preview harness and has no purpose in the production deployment. Removal
 * eliminates the cross-origin information-leak surface and, as a
 * side-benefit, unblocks a strict CSP without `script-src 'unsafe-inline'`
 * (see F-02).
 */