/**
 * The lead list's own words: the tone of a stage by what it means, and the
 * follow-up line it writes.
 *
 * Client-safe on purpose. `leads-screen.tsx` runs in the browser and the row
 * the phone is sent is built on the server, and both read these, so one of
 * them has to be the definition.
 */

/** A stage as every lead screen carries it — the master row, reduced. */
export interface StageRef {
  id: string;
  code: string;
  name: string;
  kind: string;
  sortOrder: number;
}

/**
 * Stages are named by Admin, so colour follows what a stage *means* rather
 * than what it is called.
 */
export const STAGE_KIND_TONE: Record<string, "muted" | "brand" | "warn" | "good" | "bad"> = {
  NEW: "muted",
  OPEN: "brand",
  ONBOARDING: "good",
  LOST: "bad",
};

export const stageTone = (kind: string) => STAGE_KIND_TONE[kind] ?? "muted";

/** The next follow-up, as the screen writes it: 08/09/2026 · 11:00, and how late. */
export function leadFollowUp(
  nextActionAt: string | Date | null,
  nowMs: number,
): { text: string; badge: string; tone: "bad" | "warn" | "brand" } | null {
  if (!nextActionAt) return null;
  const due = new Date(nextActionAt);
  const days = Math.round((due.getTime() - nowMs) / 86_400_000);
  const dd = String(due.getDate()).padStart(2, "0");
  const mm = String(due.getMonth() + 1).padStart(2, "0");
  const when = `${dd}/${mm}/${due.getFullYear()} · ${due.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`;
  if (days < 0) return { text: when, badge: "overdue", tone: "bad" };
  if (days === 0) return { text: when, badge: "today", tone: "warn" };
  return { text: when, badge: "upcoming", tone: "brand" };
}

export const LEAD_EMPTY = { title: "No leads match these filters." };

export const LEAD_NOTE =
  "Stages, form fields and lost reasons are configured in Masters. Dropping a card on a Lost " +
  "stage asks for a reason and remarks; dropping it on Onboarding opens the rider's onboarding.";
