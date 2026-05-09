import type { Metadata } from "next";
import { DM_Sans } from "next/font/google";
import { headers } from "next/headers";
import "./globals.css";
import ClientBody from "./ClientBody";

const dmSans = DM_Sans({
  variable: "--font-dm-sans",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
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
    <html lang="de" className={dmSans.variable}>
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