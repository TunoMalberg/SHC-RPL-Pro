"use client";

import { useEffect } from "react";
import { AppProvider } from "@/components/AppProvider";
import { Toaster } from "@/components/ui/sonner";

export default function ClientBody({
  children,
}: {
  children: React.ReactNode;
}) {
  useEffect(() => {
    document.body.className = "antialiased font-sans";
  }, []);

  return (
    <AppProvider>
      <div className="antialiased">{children}</div>
      {/*
        Sonner-Toaster für globale, nicht-blockierende Fehler-/Erfolgs-Meldungen.
        Ersetzt die früheren `alert(...)`-Aufrufe in ClientView/AdvisorSettings.
        - position: top-right ist auf Desktop am wenigsten störend
        - richColors: rote Tönung bei toast.error, grün bei toast.success
        - aria-live wird automatisch von sonner gesetzt → screen-reader-tauglich
      */}
      <Toaster position="top-right" richColors closeButton />
    </AppProvider>
  );
}