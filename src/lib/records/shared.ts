import "server-only";

export * from "./types";

/** Rupees as the ERP prints them — lakh and crore, Indian grouping. */
export function money(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  const v = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  if (v >= 10_000_000) return `${sign}₹${(v / 10_000_000).toFixed(2)} Cr`;
  if (v >= 100_000) return `${sign}₹${(v / 100_000).toFixed(2)} L`;
  return `${sign}₹${v.toLocaleString("en-IN")}`;
}
