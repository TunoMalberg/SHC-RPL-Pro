"use client";

/**
 * Generischer Empty-State für Tabs ohne Simulationsergebnis.
 *
 * Vor diesem Component zeigten ResultsDashboard/Historical/Detailed/Scenarios
 * entweder eine sehr karge Zeile oder direkt nichts (`return null`). Ein
 * Banker landete dann auf einer scheinbar leeren Seite — verwirrend in einem
 * Beratungstermin.
 *
 * Dieses Component bietet:
 *   - Klare Erklärung, warum der Tab leer ist
 *   - Ein Call-to-Action zurück zum Simulations-Tab (per dispatch)
 *   - Optional einen Zusatztext (z. B. „Tipp: …")
 *   - DE/EN über i18n
 *
 * Bewusst klein (~30 LOC), damit er in jeder Section drop-in genutzt werden
 * kann.
 */

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useAppState } from "@/lib/store";
import { useI18n } from "@/lib/i18n";

interface EmptyStateProps {
  /** Lucide-/Emoji-Icon links oben. Default: 📊 */
  icon?: string;
  /** Hauptüberschrift (i18n-key oder fertiger Text). */
  title: string;
  /** Erklärtext darunter. */
  description: string;
  /** Optionaler kleiner Hinweis (kursiv). */
  hint?: string;
  /** Wenn gesetzt: blendet einen Button "Zur Simulation" ein. */
  ctaToSimulation?: boolean;
  /** Optionale data-design-id für Markup-Identität. */
  designId?: string;
}

export function EmptyState({
  icon = "📊",
  title,
  description,
  hint,
  ctaToSimulation = true,
  designId,
}: EmptyStateProps) {
  const { dispatch } = useAppState();
  const { t } = useI18n();

  return (
    <Card
      className="border-dashed border-slate-200 bg-slate-50/40"
      data-design-id={designId ?? "empty-state"}
    >
      <CardContent className="py-10 px-6 text-center max-w-xl mx-auto">
        <div className="text-5xl mb-3" aria-hidden="true">{icon}</div>
        <h3 className="text-lg font-semibold text-slate-700">{title}</h3>
        <p className="text-sm text-slate-500 mt-2 leading-relaxed">{description}</p>
        {hint && (
          <p className="text-xs text-slate-400 italic mt-3">{hint}</p>
        )}
        {ctaToSimulation && (
          <Button
            type="button"
            onClick={() => dispatch({ type: "SET_TAB", payload: "simulation" })}
            className="mt-5 bg-[#D31220] hover:bg-[#a80e19]"
          >
            {t("empty.ctaToSimulation") || "Zur Simulation"}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}