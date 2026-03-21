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
  title: "Schelhammer Capital — Ruhestandsplanung",
  description: "Professionelle Ruhestandsplanung mit Drei-Topf-Portfoliomodell, Monte-Carlo-Simulation und historischer Rückrechnung. Schelhammer Capital Bank AG.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="de" className={dmSans.variable}>
      <head>
        <script data-design-ignore="true" dangerouslySetInnerHTML={{ __html: `(function(){if(window===window.parent||window.__DESIGN_NAV_REPORTER__)return;window.__DESIGN_NAV_REPORTER__=true;function report(){try{window.parent.postMessage({type:'IFRAME_URL_CHANGE',payload:{url:location.origin+location.pathname+location.hash}},'*');}catch(e){}}report();var ps=history.pushState,rs=history.replaceState;history.pushState=function(){ps.apply(this,arguments);report();};history.replaceState=function(){rs.apply(this,arguments);report();};window.addEventListener('popstate',report);window.addEventListener('hashchange',report);window.addEventListener('load',report);})();` }} />
      </head>
      <body suppressHydrationWarning className="antialiased font-sans">
        <ClientBody>{children}</ClientBody>
      </body>
    </html>
  );
}
