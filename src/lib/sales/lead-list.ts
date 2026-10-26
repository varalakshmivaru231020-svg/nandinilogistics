import type { Prisma } from "@prisma/client";

/**
 * The lead list's filters — search, stage, company, tele-caller, follow-up
 * and the capture date — as one function, used by the Leads screen and by its
 * export, so a download holds exactly the leads the screen was showing.
 *
 * The parameter names are the ones the screen registry sends the phone, so
 * all three read the same URL.
 */

export interface LeadListParams {
  q: string;
  /** A LeadStage id, or "" for every stage. */
  stage: string;
  /** A company id, or "". */
  company: string;
  /** A tele-caller's user id, or "". */
  owner: string;
  /** today | overdue | week | none, or "". */
  fu: string;
  /** Captured on or after, yyyy-mm-dd. */
  from: string;
  /** Captured on or before, yyyy-mm-dd. */
  to: string;
}

type ParamSource = URLSearchParams | Record<string, string | string[] | undefined>;

const one = (v: string | string[] | undefined | null) => (Array.isArray(v) ? v[0] : v)?.trim() ?? "";
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
const day = (v: string) => {
  if (!ISO_DAY.test(v)) return "";
  const d = new Date(`${v}T00:00:00.000Z`);
  // Rejects 2026-02-31, which Date would otherwise roll into March.
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v ? v : "";
};

export function readLeadListParams(params: ParamSource): LeadListParams {
  const read = (key: string) => (params instanceof URLSearchParams ? one(params.get(key)) : one(params[key]));
  // "all" is what the screens' selects post for the everything-option.
  const pick = (key: string) => (read(key) === "all" ? "" : read(key));
  return {
    q: read("q"),
    stage: pick("stage"),
    company: pick("company"),
    owner: pick("owner"),
    fu: pick("fu"),
    from: day(read("from")),
    to: day(read("to")),
  };
}

const FOLLOW_UPS = ["today", "overdue", "week", "none"];

/**
 * @param ownership `{}` for someone who sees every lead, `{ ownerId }` otherwise
 * @param now       read once by the caller, so "overdue" means the same thing
 *                  to the screen and to the export made from it
 */
export function leadListWhere(
  ownership: { ownerId?: string },
  p: LeadListParams,
  now: Date,
): Prisma.LeadWhereInput {
  const q = p.q.trim();
  const soon = new Date(now.getTime() + 7 * 86_400_000);
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const fu = FOLLOW_UPS.includes(p.fu) ? p.fu : "";

  const captured: { gte?: Date; lt?: Date } = {};
  if (p.from) captured.gte = new Date(`${p.from}T00:00:00.000Z`);
  if (p.to) {
    const end = new Date(`${p.to}T00:00:00.000Z`);
    end.setUTCDate(end.getUTCDate() + 1);
    captured.lt = end;
  }

  return {
    ...ownership,
    ...(q
      ? {
          OR: [
            { name: { contains: q, mode: "insensitive" } },
            { phone: { contains: q } },
            { leadNo: { contains: q, mode: "insensitive" } },
            { location: { contains: q, mode: "insensitive" } },
          ],
        }
      : {}),
    ...(p.stage ? { stageId: p.stage } : {}),
    ...(p.company ? { companies: { some: { companyId: p.company } } } : {}),
    // The owner filter narrows within the viewer's own scope; it never widens it.
    ...(p.owner && !ownership.ownerId ? { ownerId: p.owner } : {}),
    ...(fu === "overdue" ? { nextActionAt: { lt: now } } : {}),
    ...(fu === "today" ? { nextActionAt: { gte: startOfDay, lt: endOfDay } } : {}),
    ...(fu === "week" ? { nextActionAt: { gte: now, lte: soon } } : {}),
    ...(fu === "none" ? { nextActionAt: null } : {}),
    ...(captured.gte || captured.lt ? { createdAt: captured } : {}),
  };
}

const FOLLOW_UP_WORDS: Record<string, string> = {
  overdue: "Follow-up overdue",
  today: "Follow-up due today",
  week: "Follow-up in the next 7 days",
  none: "No follow-up set",
};

/** The filters in words, for the heading of an export. */
export function describeLeadFilters(
  p: LeadListParams,
  names: { stage?: string | null; company?: string | null; owner?: string | null } = {},
): string {
  const parts = [
    p.q.trim() ? `Search "${p.q.trim()}"` : null,
    names.stage ? `Stage ${names.stage}` : null,
    names.company ? `Company ${names.company}` : null,
    names.owner ? `Tele-caller ${names.owner}` : null,
    FOLLOW_UP_WORDS[p.fu] ?? null,
    p.from || p.to ? `Captured ${p.from || "any"} to ${p.to || "any"}` : null,
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : "All leads in view";
}
