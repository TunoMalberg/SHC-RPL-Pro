"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

interface FormattedNumberInputProps
  extends Omit<React.ComponentProps<"input">, "onChange" | "value" | "type"> {
  value: number;
  onChange: (value: number) => void;
  decimals?: number;
  prefix?: string;
  suffix?: string;
  allowNegative?: boolean;
}

/**
 * Number input that displays values with the Austrian thousand separator (1.000)
 * to avoid input errors caused by too many zeros. Internally stores a raw number.
 *
 * - When the field is focused, the raw (unformatted) value is shown for easy editing.
 * - When it blurs, the value is re-formatted with de-AT locale (e.g. "1.000").
 * - Only digits, minus, comma/period are accepted while editing.
 */
export const FormattedNumberInput = React.forwardRef<
  HTMLInputElement,
  FormattedNumberInputProps
>(function FormattedNumberInput(
  {
    value,
    onChange,
    decimals = 0,
    prefix,
    suffix,
    allowNegative = false,
    className,
    onFocus,
    onBlur,
    ...props
  },
  ref
) {
  const [focused, setFocused] = React.useState(false);
  const [rawText, setRawText] = React.useState<string>("");

  const format = React.useCallback(
    (n: number) =>
      new Intl.NumberFormat("de-AT", {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      }).format(n),
    [decimals]
  );

  // Parse a user-entered string (German locale: "." = thousand, "," = decimal)
  const parse = (s: string): number => {
    if (!s) return 0;
    const cleaned = s
      .replace(/\s/g, "")
      .replace(/\./g, "") // remove thousand dots
      .replace(",", "."); // comma → decimal point
    const n = parseFloat(cleaned);
    if (isNaN(n)) return 0;
    return allowNegative ? n : Math.max(0, n);
  };

  const display = focused
    ? rawText
    : `${prefix ?? ""}${format(value || 0)}${suffix ?? ""}`;

  return (
    <input
      ref={ref}
      type="text"
      inputMode="decimal"
      value={display}
      onFocus={(e) => {
        setFocused(true);
        // Enter unformatted editable text on focus
        const editable =
          decimals > 0
            ? String(value ?? 0).replace(".", ",")
            : String(Math.round(value ?? 0));
        setRawText(editable);
        // Select all so user can type replacement quickly
        requestAnimationFrame(() => e.target.select());
        onFocus?.(e);
      }}
      onChange={(e) => {
        const s = e.target.value;
        // Allow empty, digits, minus (if allowed), comma, period
        const allowedPattern = allowNegative ? /^-?[\d.,]*$/ : /^[\d.,]*$/;
        if (!allowedPattern.test(s)) return;
        setRawText(s);
        onChange(parse(s));
      }}
      onBlur={(e) => {
        setFocused(false);
        onBlur?.(e);
      }}
      className={cn(
        "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm tabular-nums",
        className
      )}
      {...props}
    />
  );
});