import * as React from "react"

import { cn } from "@/lib/utils"

const INPUT_CLASS =
  "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm"

/** Vollständige Zahl in deutscher oder englischer Schreibweise („2,5" / "2.5"). */
const COMPLETE_NUMBER = /^-?\d+([.,]\d+)?$/
/** Erlaubte Zwischenstände beim Tippen („", „-", „2,", „0,0"). */
const PARTIAL_NUMBER = /^-?\d*([.,]\d*)?$/

/** Anzeige mit Dezimalkomma, ohne Tausenderpunkt (Jahreszahlen bleiben „1980"). */
function toDisplay(value: unknown): string {
  if (value === undefined || value === null || value === "") return ""
  return String(value).replace(".", ",")
}

/** Leitet eine normalisierte Zahl als change-Event an den bisherigen Handler weiter. */
function emitChange(
  onChange: React.ChangeEventHandler<HTMLInputElement> | undefined,
  e: React.SyntheticEvent<HTMLInputElement>,
  normalized: string,
) {
  if (!onChange) return
  const target = { value: normalized, name: e.currentTarget.name, id: e.currentTarget.id }
  onChange({ ...e, target, currentTarget: target } as unknown as React.ChangeEvent<HTMLInputElement>)
}

/**
 * Zahlenfeld, das auf iPhone/iPad und am Computer gleich zuverlässig ist.
 *
 * Ersetzt das native `type="number"`, das auf iOS zwei Probleme hatte:
 *  1. Leeren des Feldes lieferte "" → die Aufrufer setzten sofort den
 *     Vorgabewert zurück (z. B. „|| 65") — eine neue Zahl ließ sich kaum
 *     eintippen.
 *  2. Das Dezimalkomma der deutschen Tastatur („2,") galt während der
 *     Eingabe als ungültig → Wert sprang auf 0, das Komma ging verloren.
 *
 * Lösung: Während der Eingabe hält das Feld den getippten Text selbst und
 * meldet nur vollständige Zahlen (mit Punkt normalisiert) an den Aufrufer.
 * Leere oder halbe Eingaben bleiben stehen; beim Verlassen erscheint wieder
 * der zuletzt gültige Wert. Pfeiltasten ↑/↓ erhöhen/senken um `step`.
 */
const NumericInput = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, value, onChange, onFocus, onBlur, onKeyDown, step, min, max, ...props }, ref) => {
    const [editing, setEditing] = React.useState<string | null>(null)
    const allowNegative = min === undefined || Number(min) < 0
    const isInteger = step !== undefined && Number.isInteger(Number(step)) && Number(step) >= 1

    return (
      <input
        ref={ref}
        type="text"
        inputMode={isInteger && !allowNegative ? "numeric" : "decimal"}
        autoComplete="off"
        value={editing ?? toDisplay(value)}
        onFocus={(e) => {
          setEditing(toDisplay(value))
          const el = e.currentTarget
          // iOS ignoriert select() direkt im Fokus-Ereignis → kurz verzögert.
          setTimeout(() => {
            try {
              el.setSelectionRange(0, el.value.length)
            } catch {
              /* Feld bereits verlassen */
            }
          }, 0)
          onFocus?.(e)
        }}
        onChange={(e) => {
          const text = e.target.value.replace(/\s/g, "")
          if (!PARTIAL_NUMBER.test(text) || (!allowNegative && text.startsWith("-"))) return
          setEditing(text)
          if (COMPLETE_NUMBER.test(text)) emitChange(onChange, e, text.replace(",", "."))
        }}
        onBlur={(e) => {
          setEditing(null)
          onBlur?.(e)
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowUp" || e.key === "ArrowDown") {
            e.preventDefault()
            const current = Number(String(editing ?? value ?? 0).replace(",", ".")) || 0
            const s = Number(step) > 0 ? Number(step) : 1
            let next = current + (e.key === "ArrowUp" ? s : -s)
            if (min !== undefined) next = Math.max(Number(min), next)
            if (max !== undefined) next = Math.min(Number(max), next)
            const normalized = String(Math.round(next * 1e6) / 1e6)
            setEditing(normalized.replace(".", ","))
            emitChange(onChange, e, normalized)
          }
          onKeyDown?.(e)
        }}
        className={cn(INPUT_CLASS, "tabular-nums", className)}
        {...props}
      />
    )
  }
)
NumericInput.displayName = "NumericInput"

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => {
    if (type === "number") {
      return <NumericInput ref={ref} className={className} {...props} />
    }
    return (
      <input
        type={type}
        className={cn(INPUT_CLASS, className)}
        ref={ref}
        {...props}
      />
    )
  }
)
Input.displayName = "Input"

export { Input }
