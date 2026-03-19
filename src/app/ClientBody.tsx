"use client";

import { useEffect } from "react";
import { AppProvider } from "@/components/AppProvider";

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
    </AppProvider>
  );
}
