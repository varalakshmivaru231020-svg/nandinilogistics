import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const INR = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

const INR_PRECISE = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function money(value: unknown, precise = false): string {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n)) return "—";
  return precise ? INR_PRECISE.format(n) : INR.format(n);
}

/** Indian short-form for dashboard tiles: 1.85 Cr, 12.4 L, 45,000. */
export function moneyShort(value: unknown): string {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n)) return "—";
  const abs = Math.abs(n);
  if (abs >= 1e7) return `₹${(n / 1e7).toFixed(2)} Cr`;
  if (abs >= 1e5) return `₹${(n / 1e5).toFixed(2)} L`;
  return `₹${n.toLocaleString("en-IN")}`;
}

export function qty(value: unknown, precision = 2): string {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString("en-IN", {
    minimumFractionDigits: 0,
    maximumFractionDigits: precision,
  });
}

/**
 * The design's month abbreviations. Written out rather than left to the
 * locale, because en-GB abbreviates September as "Sept" and the design does
 * not.
 */
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "05 Sep 2026", as the design writes a date. */
export function formatDate(value: Date | string | null | undefined): string {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "—";
  return `${String(d.getDate()).padStart(2, "0")} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

/** "Sep" — the month on its own. */
export function shortMonth(value: Date): string {
  return MONTHS[value.getMonth()];
}

/** "05 Sep", the design's short form where the year is understood. */
export function formatDayMonth(value: Date | string | null | undefined): string {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "—";
  return `${String(d.getDate()).padStart(2, "0")} ${MONTHS[d.getMonth()]}`;
}

/** "28 Aug 2026, 11:20". */
export function formatDateTime(value: Date | string | null | undefined): string {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "—";
  const time = d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  return `${formatDate(d)}, ${time}`;
}

export function daysBetween(from: Date | string, to: Date | string = new Date()): number {
  const a = typeof from === "string" ? new Date(from) : from;
  const b = typeof to === "string" ? new Date(to) : to;
  return Math.floor((b.getTime() - a.getTime()) / 86_400_000);
}

/** Turns a Prisma Decimal / string / number into a plain number for the client. */
export function num(value: unknown): number {
  if (value === null || value === undefined) return 0;
  const n = Number(value.toString());
  return Number.isFinite(n) ? n : 0;
}

export function titleFromCode(code: string): string {
  return code
    .replace(/[._-]/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Masks a phone number down to its last four digits. Used wherever a viewer
 * lacks `sales.lead.viewContact` — the number is never sent to the client in
 * full, so hiding it is not a UI courtesy but the actual boundary.
 */
/**
 * A mobile number as the design writes it: +91 98450 11234. Anything that is
 * not a plain ten-digit Indian number is left exactly as it was entered.
 */
export function phone(value: string) {
  const digits = value.replace(/\D/g, "");
  if (digits.length === 10) return `+91 ${digits.slice(0, 5)} ${digits.slice(5)}`;
  if (digits.length === 12 && digits.startsWith("91")) {
    return `+91 ${digits.slice(2, 7)} ${digits.slice(7)}`;
  }
  return value;
}

export function maskPhone(phone: string) {
  return phone.length > 4 ? `${"•".repeat(phone.length - 4)}${phone.slice(-4)}` : "••••";
}
