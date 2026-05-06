import type { Metadata } from "next";
import { DM_Sans } from "next/font/google";
import "./globals.css";
import ClientBody from "./ClientBody";

const dmSans = DM_Sans({
  variable: "--font-dm-sans",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "Ruhestandsplaner Pro — Planung & Simulation",
  description: "Professionelle Ruhestandsplanung mit Drei-Topf-Portfoliomodell, Monte-Carlo-Simulation und historischer Rückrechnung.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
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
