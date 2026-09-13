/**
 * Column matching and value reading for imports.
 *
 * Kept apart from ./parse.ts, which reads files with exceljs and papaparse:
 * this half is dependency-free, so the import dialog can use it in the browser
 * (to build a template, say) without shipping a spreadsheet engine.
 */

export interface ImportColumn {
  key: string;
  label: string;
  required?: boolean;
  /** Other headers that mean this column, e.g. "mobile" for phone. */
  aliases?: string[];
  /** One line on what goes here, shown beside the template. */
  hint?: string;
}

/** "Lead Source", "lead_source", "leadSource" and "Lead source *" all name the same column. */
export function normaliseHeader(header: string): string {
  return header.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

/**
 * Which file header feeds each column, matching labels, keys and aliases
 * without regard to case, spaces or punctuation. Reports required columns
 * the file does not have, and headers nothing will read, so a misnamed column
 * is caught before any row is looked at.
 */
export function matchColumns(headers: string[], columns: ImportColumn[]) {
  const byNorm = new Map(headers.map((h) => [normaliseHeader(h), h]));
  const mapping: Record<string, string> = {};
  const used = new Set<string>();

  for (const col of columns) {
    for (const candidate of [col.label, col.key, ...(col.aliases ?? [])]) {
      const header = byNorm.get(normaliseHeader(candidate));
      if (header && !used.has(header)) {
        mapping[col.key] = header;
        used.add(header);
        break;
      }
    }
  }

  return {
    mapping,
    missing: columns.filter((c) => c.required && !mapping[c.key]).map((c) => c.label),
    ignored: headers.filter((h) => !used.has(h)),
  };
}

/** The value a row holds for a column, or "" when the file has no such column. */
export function valueOf(row: Record<string, string>, mapping: Record<string, string>, key: string): string {
  const header = mapping[key];
  return header ? (row[header] ?? "").trim() : "";
}

/**
 * A number as people write it in a sheet — "₹1,49,22,115", "12,500.50", " 42 "
 * — as plain digits, or the input unchanged when it is not a number at all, so
 * the validator reports it rather than this quietly zeroing it.
 */
export function numberText(value: string): string {
  const stripped = value.replace(/₹|rs\.?|inr|,|\s/gi, "");
  return /^-?\d+(\.\d+)?$/.test(stripped) ? stripped : value;
}

/** "yes", "y", "true", "1" and "active" read as true; anything else is false. */
export function truthy(value: string): boolean {
  return /^(y|yes|true|1|active)$/i.test(value.trim());
}

function pad(n: number) {
  return String(n).padStart(2, "0");
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

function validIso(y: string, mo: number, d: string): string | null {
  const iso = `${y}-${pad(mo)}-${pad(Number(d))}`;
  const check = new Date(`${iso}T00:00:00.000Z`);
  return !Number.isNaN(check.getTime()) && check.toISOString().slice(0, 10) === iso ? iso : null;
}

/**
 * A date as people type it, as yyyy-mm-dd: ISO; day-first with / . or -
 * (Indian order — 05/04/2026 is the 5th of April); or with the month named —
 * "05 Oct 2026", "5-October-2026" — which is how every export here writes
 * dates, so an exported sheet imports straight back. Unreadable input comes
 * back unchanged so the validator can say so.
 */
export function dayText(value: string): string {
  const v = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;

  const numeric = v.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  if (numeric) return validIso(numeric[3], Number(numeric[2]), numeric[1]) ?? v;

  const named = v.match(/^(\d{1,2})[\s-]+([A-Za-z]{3,9})[\s,-]+(\d{4})$/);
  if (named) {
    const month = MONTHS.indexOf(named[2].slice(0, 3).toLowerCase());
    // "Sept" is common; anything else that is not a month's name is refused.
    const isMonth = month >= 0 && (named[2].length === 3 || /^sept$/i.test(named[2])
      || named[2].toLowerCase() === ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"][month]);
    if (isMonth) return validIso(named[3], month + 1, named[1]) ?? v;
  }
  return v;
}

/** A blank template: just the headers, required columns marked. */
export function templateCsv(columns: ImportColumn[]): string {
  const quote = (s: string) => `"${s.replace(/"/g, '""')}"`;
  return "﻿" + columns.map((c) => quote(c.required ? `${c.label} *` : c.label)).join(",") + "\r\n";
}

/** What an import found, row by row — the shape every importer returns. */
export interface ImportRowOutcome {
  /** The row number as the user sees it in their sheet (the header is row 1). */
  row: number;
  label: string;
  errors: string[];
  /** Not an error: something the user should know, e.g. a possible duplicate. */
  notes?: string[];
}

export interface ImportPlan {
  missing: string[];
  ignored: string[];
  rows: ImportRowOutcome[];
  valid: number;
  invalid: number;
}

export interface ImportSummary {
  created: number;
  skipped: number;
  message: string;
}
