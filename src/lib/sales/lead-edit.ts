/**
 * Editing a lead after capture: who may, what may change, and how duplicate
 * links follow a changed phone number.
 *
 * Pure — no Prisma, no clock. The database side is ./lead-edit-service.ts,
 * which loads the lead and hands it in; the rules live here so they can be
 * exercised directly and cannot drift between callers.
 */
import { maskPhone } from "@/lib/utils";

import { LeadSchema, phoneKey } from "./lead-schema";

/** A lead as the edit rules see it — Decimals already numbers. */
export interface EditableLead {
  id: string;
  ownerId: string | null;
  state: string;
  /** Whether any booking hangs off this lead, whatever its state now says. */
  hasBooking: boolean;
  name: string;
  phone: string;
  altPhone: string | null;
  email: string | null;
  sourceId: string;
  projectId: string | null;
  unitTypeId: string | null;
  budgetMin: number | null;
  budgetMax: number | null;
  requirement: string | null;
  nextActionAt: Date | null;
}

export interface LeadEditActor {
  id: string;
  /** sales.lead.viewAll — may work any lead, not only their own. */
  canViewAll: boolean;
  /** sales.lead.viewContact — sees, and so may change, phone numbers and email. */
  canViewContact: boolean;
}

/** The fields this edit writes. Stage, owner, lost reason and follow-ups have their own actions. */
export const EDITABLE_FIELDS = [
  "name", "phone", "altPhone", "email", "sourceId", "projectId", "unitTypeId",
  "budgetMin", "budgetMax", "requirement", "nextActionAt",
] as const;
export type EditableField = (typeof EDITABLE_FIELDS)[number];

export const CONTACT_FIELDS: readonly EditableField[] = ["phone", "altPhone", "email"];
/** Fixed once a booking exists: the customer record and the booking were made from them. */
export const IDENTITY_FIELDS: readonly EditableField[] = ["name", "phone"];

export const FIELD_LABEL: Record<EditableField, string> = {
  name: "name", phone: "phone", altPhone: "alternate phone", email: "email",
  sourceId: "lead source", projectId: "project", unitTypeId: "interested in",
  budgetMin: "budget from", budgetMax: "budget to", requirement: "requirement",
  nextActionAt: "next action on",
};

export type LeadEditValues = Pick<EditableLead, EditableField>;

export class LeadEditError extends Error {
  constructor(
    readonly kind: "forbidden" | "invalid" | "stale" | "not-found",
    message: string,
    /** For a refusal: the permission that would have allowed it. */
    readonly needs?: "viewAll" | "viewContact",
  ) {
    super(message);
    this.name = "LeadEditError";
  }
}

export const STALE_MESSAGE = "This lead was changed by someone else — reload it and make your edit again.";

/** Leads that are closed: no new follow-up can be scheduled on them without reopening. */
const CLOSED_STATES = new Set(["BOOKED", "LOST"]);

/**
 * The ownership rule the lead list uses: without viewAll, only your own leads.
 * Returns the refusal, or null when the actor may edit.
 */
export function editRefusal(actor: LeadEditActor, lead: Pick<EditableLead, "ownerId">): string | null {
  if (actor.canViewAll || lead.ownerId === actor.id) return null;
  return "You can only edit leads assigned to you.";
}

/** Whether a booked lead's name and phone are fixed. */
export function identityLocked(lead: Pick<EditableLead, "state" | "hasBooking">): boolean {
  return lead.state === "BOOKED" || lead.hasBooking;
}

/**
 * The value a date input is prefilled with, and compared against on save. The
 * UTC day, the same instant `new Date("YYYY-MM-DD")` gives back — so a date
 * left untouched in the form is recognised as unchanged and keeps its time.
 */
export function dateInputValue(d: Date | null): string {
  return d ? d.toISOString().slice(0, 10) : "";
}

const text = (v: unknown): string => (typeof v === "string" ? v.trim() : "");
const orNull = (v: string): string | null => (v === "" ? null : v);

/**
 * Checks a submitted edit against the lead as stored, and works out what changes.
 *
 * Fields missing from the form keep their stored value — a partial form cannot
 * blank a field by omission. Throws LeadEditError; returns only the fields that
 * differ, with the full before/after for the audit.
 */
export function planLeadEdit(
  lead: EditableLead,
  actor: LeadEditActor,
  form: Record<string, unknown>,
): { before: LeadEditValues; after: LeadEditValues; changed: EditableField[] } {
  const refusal = editRefusal(actor, lead);
  if (refusal) throw new LeadEditError("forbidden", refusal, "viewAll");

  const has = (k: string) => Object.prototype.hasOwnProperty.call(form, k);
  const pick = (k: EditableField, stored: string | null) => (has(k) ? text(form[k]) : (stored ?? ""));

  const before: LeadEditValues = {
    name: lead.name, phone: lead.phone, altPhone: lead.altPhone, email: lead.email,
    sourceId: lead.sourceId, projectId: lead.projectId, unitTypeId: lead.unitTypeId,
    budgetMin: lead.budgetMin, budgetMax: lead.budgetMax, requirement: lead.requirement,
    nextActionAt: lead.nextActionAt,
  };

  // Contact fields: someone who sees a masked number cannot overwrite it blind.
  const contact = {
    phone: pick("phone", lead.phone),
    altPhone: pick("altPhone", lead.altPhone),
    email: pick("email", lead.email),
  };
  if (!actor.canViewContact) {
    const touched = CONTACT_FIELDS.filter((k) => contact[k as keyof typeof contact] !== (before[k] ?? ""));
    if (touched.length) {
      throw new LeadEditError(
        "forbidden",
        `You cannot change the ${touched.map((k) => FIELD_LABEL[k]).join(", ")} — you do not have access to this lead's contact details.`,
        "viewContact",
      );
    }
  }

  const budget = (k: "budgetMin" | "budgetMax") => {
    if (!has(k)) return before[k] ?? undefined;
    const t = text(form[k]);
    return t === "" ? undefined : t;
  };

  const storedDay = dateInputValue(lead.nextActionAt);
  const nextText = pick("nextActionAt", storedDay);
  if (has("nextActionAt") && nextText !== "" && nextText !== storedDay) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(nextText) || Number.isNaN(new Date(nextText).getTime())) {
      throw new LeadEditError("invalid", "Next action on must be a date.");
    }
  }

  // The same rules as capture.
  const parsed = LeadSchema.safeParse({
    name: pick("name", lead.name),
    phone: contact.phone,
    altPhone: contact.altPhone || undefined,
    email: contact.email,
    sourceId: pick("sourceId", lead.sourceId),
    projectId: pick("projectId", lead.projectId) || undefined,
    requirement: pick("requirement", lead.requirement) || undefined,
    budgetMin: budget("budgetMin"),
    budgetMax: budget("budgetMax"),
  });
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const field = issue.path[0];
    throw new LeadEditError(
      "invalid",
      field === "budgetMin" || field === "budgetMax"
        ? `${field === "budgetMin" ? "Budget from" : "Budget to"} must be a number of rupees, not negative.`
        : issue.message,
    );
  }
  const v = parsed.data;
  if (v.budgetMin !== undefined && v.budgetMax !== undefined && v.budgetMin > v.budgetMax) {
    throw new LeadEditError("invalid", "Budget from is more than budget to.");
  }

  const after: LeadEditValues = {
    name: v.name,
    phone: v.phone,
    altPhone: orNull(v.altPhone ?? ""),
    email: orNull(v.email ?? ""),
    sourceId: v.sourceId,
    projectId: orNull(v.projectId ?? ""),
    unitTypeId: orNull(pick("unitTypeId", lead.unitTypeId)),
    budgetMin: v.budgetMin ?? null,
    budgetMax: v.budgetMax ?? null,
    requirement: orNull(v.requirement ?? ""),
    // An untouched date keeps its stored instant, time of day included.
    nextActionAt: nextText === storedDay ? lead.nextActionAt : nextText ? new Date(nextText) : null,
  };

  const changed = EDITABLE_FIELDS.filter((k) => !sameValue(before[k], after[k]));

  if (identityLocked(lead)) {
    const locked = changed.filter((k) => IDENTITY_FIELDS.includes(k));
    if (locked.length) {
      throw new LeadEditError(
        "invalid",
        `This lead has a booking — its ${locked.map((k) => FIELD_LABEL[k]).join(" and ")} cannot change here. Correct them on the customer record.`,
      );
    }
  }

  if (CLOSED_STATES.has(lead.state) && changed.includes("nextActionAt") && after.nextActionAt) {
    throw new LeadEditError(
      "invalid",
      `A ${lead.state === "BOOKED" ? "booked" : "lost"} lead has no follow-ups to schedule — move it back to an open stage first.`,
    );
  }

  return { before, after, changed };
}

function sameValue(a: unknown, b: unknown): boolean {
  if (a instanceof Date || b instanceof Date) {
    return a instanceof Date && b instanceof Date ? a.getTime() === b.getTime() : false;
  }
  return a === b;
}

/* ------------------------------ duplicates ------------------------------- */

export interface PhoneCandidate {
  id: string;
  phone: string;
  createdAt: Date;
  duplicateOfId: string | null;
}

/** The shortest phoneKey treated as a real number — the import's threshold. */
export const MIN_PHONE_KEY = 8;

/**
 * Where the duplicate links land after a lead's phone number changes.
 *
 * - The edited lead links to the earliest OTHER lead with the new number
 *   (matched loosely by phoneKey), or to nothing when there is none.
 * - Leads that pointed at it as their original, but no longer share its
 *   number, are re-pointed: each to the earliest other lead with its own
 *   number, excluding the edited lead — the earliest of them becomes the new
 *   original. They were duplicates of the old number, not of this person.
 * - If some lead still points at it afterwards (its number matches the new
 *   one), the edited lead stays an original rather than becoming a duplicate
 *   itself: links are never chained, so none can loop.
 * - A lead never links to itself, and never to a lead whose own chain of links
 *   leads back to it.
 *
 * `others` is every lead that might be involved: anything matching the new
 * number, and everything pointing at the edited lead with its own matches.
 * It may include the edited lead itself; it is ignored.
 */
export function planDuplicateRelink(
  leadId: string,
  newPhone: string,
  others: PhoneCandidate[],
): { duplicateOfId: string | null; repoint: Array<{ id: string; duplicateOfId: string | null }> } {
  const pool = others.filter((o) => o.id !== leadId);
  const byId = new Map(pool.map((o) => [o.id, o]));
  const order = (a: PhoneCandidate, b: PhoneCandidate) =>
    a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id);
  const keyOf = (p: string) => {
    const k = phoneKey(p);
    return k.length >= MIN_PHONE_KEY ? k : null;
  };

  const newKey = keyOf(newPhone);
  const dependents = pool.filter((o) => o.duplicateOfId === leadId);

  // Re-point dependents whose number no longer matches.
  const repoint: Array<{ id: string; duplicateOfId: string | null }> = [];
  const staying: PhoneCandidate[] = [];
  for (const d of dependents) {
    const dKey = keyOf(d.phone);
    if (newKey && dKey === newKey) { staying.push(d); continue; }
    const target = dKey
      ? pool
          .filter((o) => o.id !== d.id && keyOf(o.phone) === dKey)
          .sort(order)[0]
      : undefined;
    // The earliest of a group is the original; everyone later points at it.
    const next = target && order(target, d) < 0 ? target.id : null;
    repoint.push({ id: d.id, duplicateOfId: next });
  }

  if (staying.length > 0 || !newKey) return { duplicateOfId: null, repoint };

  const repointed = new Map(repoint.map((r) => [r.id, r.duplicateOfId]));
  const reachesLead = (startId: string) => {
    const seen = new Set<string>();
    let cur: string | null = startId;
    while (cur) {
      if (cur === leadId) return true;
      if (seen.has(cur)) return true; // an existing loop — never join it
      seen.add(cur);
      cur = repointed.has(cur) ? repointed.get(cur)! : (byId.get(cur)?.duplicateOfId ?? null);
    }
    return false;
  };

  const match = pool
    .filter((o) => keyOf(o.phone) === newKey)
    .sort(order)
    .find((o) => !reachesLead(o.id));
  return { duplicateOfId: match?.id ?? null, repoint };
}

/* --------------------------------- audit --------------------------------- */

/** A contact value as the audit trail may show it: that it changed, not what to. */
export function maskContact(field: string, value: unknown): unknown {
  if (typeof value !== "string" || value === "") return value;
  if (field === "phone" || field === "altPhone") return maskPhone(value);
  if (field === "email") {
    const [user, domain] = value.split("@");
    return domain ? `${user.slice(0, 1)}•••@${domain}` : "•••";
  }
  return value;
}

/** Masks contact values in a field-level diff. Every change is still recorded. */
export function maskChanges(
  changes: Record<string, { from: unknown; to: unknown }> | null,
): Record<string, { from: unknown; to: unknown }> | null {
  if (!changes) return null;
  return Object.fromEntries(
    Object.entries(changes).map(([k, c]) => [k, { from: maskContact(k, c.from), to: maskContact(k, c.to) }]),
  );
}

export function editSummary(leadNo: string, changed: EditableField[], relinked: number): string {
  const fields = changed.map((k) => FIELD_LABEL[k]);
  const list = fields.length > 1 ? `${fields.slice(0, -1).join(", ")} and ${fields.at(-1)}` : fields[0];
  return `Edited lead ${leadNo} — ${list}${relinked ? ` (duplicate links updated on ${relinked} other lead${relinked === 1 ? "" : "s"})` : ""}`;
}
