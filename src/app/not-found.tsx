/**
 * 404-Seite. Bewusst statisch und ohne Client-State, damit sie auch dann
 * gerendert wird, wenn Provider/Reducer einen Fehler haben.
 */

import Link from "next/link";

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-neutral-50 via-white to-red-50/30 p-6">
      <div className="max-w-md w-full text-center">
        <p className="text-7xl font-bold text-[#D31220] tracking-tight">404</p>
        <h1 className="mt-4 text-2xl font-semibold text-slate-900">
          Seite nicht gefunden
        </h1>
        <p className="mt-2 text-sm text-slate-500">
          Die angeforderte Seite existiert nicht oder wurde verschoben.<br />
          The requested page could not be found.
        </p>
        <Link
          href="/"
          className="inline-block mt-6 bg-[#D31220] hover:bg-[#a80e19] text-white px-5 py-2.5 rounded-md text-sm font-medium"
        >
          Zur Startseite / Back to home
        </Link>
      </div>
    </div>
  );
}