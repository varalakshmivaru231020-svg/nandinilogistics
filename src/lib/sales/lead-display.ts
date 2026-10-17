/**
 * The lead list's own words: its stage labels, its source tones and the
 * follow-up line it writes.
 *
 * Client-safe on purpose. `leads-screen.tsx` runs in the browser and the row
 * the phone is sent is built on the server, and both read these — the screen
 * writes "Site Visit" where the export file writes "Site visit planned", so
 * one of them has to be the definition.
 */

import type { Tone } from "@/lib/records/types";

export const LEAD_STAGE_LABEL: Record<string, string> = {
  NEW: "New", CONTACTED: "Contacted", SITE_VISIT_SCHEDULED: "Site Visit",
  VISIT_DONE: "Site Visit", NEGOTIATION: "Negotiation", BOOKED: "Booked", LOST: "Lost",
};

/**
 * The pipeline, as the web's board lays it out: one column per step, in order,
 * and two stages share the Site Visit column.
 *
 * Here rather than inside `leads-screen.tsx` because the phone cannot draw six
 * columns side by side — it draws them as tabs — and a pipeline that is a
 * sequence in one place and a different sequence in the other is two
 * pipelines. `drop` is the stage a card dropped on that column moves to.
 */
export const LEAD_PIPELINE: ReadonlyArray<{
  key: string;
  label: string;
  stages: string[];
  drop: string;
}> = [
  { key: "new", label: "New", stages: ["NEW"], drop: "NEW" },
  { key: "contacted", label: "Contacted", stages: ["CONTACTED"], drop: "CONTACTED" },
  {
    key: "visit",
    label: "Site Visit",
    stages: ["SITE_VISIT_SCHEDULED", "VISIT_DONE"],
    drop: "SITE_VISIT_SCHEDULED",
  },
  { key: "nego", label: "Negotiation", stages: ["NEGOTIATION"], drop: "NEGOTIATION" },
  { key: "booked", label: "Booked", stages: ["BOOKED"], drop: "BOOKED" },
  { key: "lost", label: "Lost", stages: ["LOST"], drop: "LOST" },
];

export const LEAD_STAGE_TONE: Record<string, "muted" | "brand" | "warn" | "navy" | "good" | "bad"> = {
  NEW: "muted", CONTACTED: "brand", SITE_VISIT_SCHEDULED: "warn",
  VISIT_DONE: "navy", NEGOTIATION: "warn", BOOKED: "good", LOST: "bad",
};

/**
 * The design colours a source chip by which source it is, and leaves anything
 * it does not know plain. The screen holds the same keys as classes;
 * `tests/unit/screen-rows.test.ts` fails if the two lists part company.
 */
export const LEAD_SOURCE_TONE: Record<string, Tone> = {
  website: "info",
  magicbricks: "warn",
  "99acres": "plum",
  "walk-in": "good",
  referral: "bad",
};

export const leadSourceTone = (name: string): Tone =>
  LEAD_SOURCE_TONE[name.trim().toLowerCase()] ?? "draft";

/** The next follow-up, as the screen writes it: 08/09/2026 · 11:00, and how late. */
export function leadFollowUp(
  nextActionAt: string | Date | null,
  nowMs: number,
  state?: string,
): { text: string; icon: string; kind: string; badge: string; tone: "bad" | "warn" | "brand" } | null {
  if (!nextActionAt) return null;
  const due = new Date(nextActionAt);
  const days = Math.round((due.getTime() - nowMs) / 86_400_000);
  const dd = String(due.getDate()).padStart(2, "0");
  const mm = String(due.getMonth() + 1).padStart(2, "0");
  const when = `${dd}/${mm}/${due.getFullYear()} · ${due.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`;
  const visit = state === "SITE_VISIT_SCHEDULED";
  const base = { text: when, icon: visit ? "🏠" : "📞", kind: visit ? "SITE VISIT" : "CALL" };
  if (days < 0) return { ...base, badge: "overdue", tone: "bad" };
  if (days === 0) return { ...base, badge: "today", tone: "warn" };
  return { ...base, badge: "upcoming", tone: "brand" };
}

export const LEAD_EMPTY = { title: "No leads match these filters." };

export const LEAD_NOTE =
  "Form fields, stages and lost reasons are configured in Masters → Lead Settings. Dropping a " +
  "card on Lost asks for a reason and remarks.";
