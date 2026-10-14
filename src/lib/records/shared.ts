import "server-only";

export * from "./types";

import type { Tone } from "./types";

/**
 * A tone the web itself decided, in its own vocabulary.
 *
 * Several display helpers — `grnMatch`, `deliveryLabel`, `PO_STATUS_TONE` —
 * return a label **and** the tone to draw it in. Passing their label through
 * `toneOf()` would second-guess a decision already made, so their word is
 * mapped straight across instead.
 */
export function webTone(
  tone: "good" | "warn" | "bad" | "muted" | "brand" | "violet" | "plain" | string,
): Tone {
  switch (tone) {
    case "good":
      return "good";
    case "warn":
      return "warn";
    case "bad":
      return "bad";
    case "violet":
      return "plum";
    case "brand":
      return "info";
    default:
      return "draft";
  }
}

/** Rupees as the ERP prints them — lakh and crore, Indian grouping. */
export function money(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  const v = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  if (v >= 10_000_000) return `${sign}₹${(v / 10_000_000).toFixed(2)} Cr`;
  if (v >= 100_000) return `${sign}₹${(v / 100_000).toFixed(2)} L`;
  return `${sign}₹${v.toLocaleString("en-IN")}`;
}
