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

/** A lead as the edit rules see it. */
export interface EditableLead {
  id: string;
  ownerId: string | null;
  /** What the lead's stage means — NEW, OPEN, ONBOARDING or LOST. */
  stageKind: string;
  name: string;
  phone: string;
  altPhone: string | null;
  email: string | null;
  location: string | null;
  requirement: string | null;
  nextActionAt: Date | null;
  /** The companies the lead is tagged for, by id, sorted. */
  companyIds: string[];
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
  "name", "phone", "altPhone", "email", "location", "requirement", "nextActionAt", "companyIds",
] as const;
export type EditableField = (typeof EDITABLE_FIELDS)[number];

export const CONTACT_FIELDS: readonly EditableField[] = ["phone", "altPhone", "email"];

export const FIELD_LABEL: Record<EditableField, string> = {
  name: "name", phone: "mobile number", altPhone: "alternate number", email: "email",
  location: "location", requirement: "notes", nextActionAt: "next follow-up on",
  companyIds: "companies",
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

/**
 * The ownership rule the lead list uses: without viewAll, only your own leads.
 * Returns the refusal, or null when the actor may edit.
 */
export function editRefusal(actor: LeadEditActor, lead: Pick<EditableLead, "ownerId">): string | null {
  if (actor.canViewAll || lead.ownerId === actor.id) return null;
  return "You can only edit leads assigned to you.";
}

/**
 * A stored instant as the calendar day it falls on in India, for a date input.
 * Reading it by UTC showed a follow-up set for early morning IST (00:00–05:30)
 * as the day before. A date typed in the app is stored as UTC midnight, which
 * is 05:30 IST on the same day, so those read back unchanged.
 */
export function dateInputValue(d: Date | null): string {
  if (!d) return "";
  // en-CA formats as yyyy-mm-dd.
  return d.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}

const text = (v: unknown): string => (typeof v === "string" ? v.trim() : "");
const orNull = (v: string): string | null => (v === "" ? null : v);

/** A multi-select's value, whichever way the form carried it. */
function idList(v: unknown): string[] {
  const raw = Array.isArray(v) ? v : typeof v === "string" ? v.split(",") : [];
  return [...new Set(raw.map((x) => String(x).trim()).filter(Boolean))].sort();
}

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
    location: lead.location, requirement: lead.requirement, nextActionAt: lead.nextActionAt,
    companyIds: [...lead.companyIds].sort(),
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

  const storedDay = dateInputValue(lead.nextActionAt);
  const nextText = pick("nextActionAt", storedDay);
  if (has("nextActionAt") && nextText !== "" && nextText !== storedDay) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(nextText) || Number.isNaN(new Date(nextText).getTime())) {
      throw new LeadEditError("invalid", "Next follow-up on must be a date.");
    }
  }

  // The same rules as capture.
  const parsed = LeadSchema.safeParse({
    name: pick("name", lead.name),
    phone: contact.phone,
    altPhone: contact.altPhone || undefined,
    email: contact.email,
    location: pick("location", lead.location) || undefined,
    requirement: pick("requirement", lead.requirement) || undefined,
  });
  if (!parsed.success) {
    throw new LeadEditError("invalid", parsed.error.issues[0].message);
  }
  const v = parsed.data;

  const after: LeadEditValues = {
    name: v.name,
    phone: v.phone,
    altPhone: orNull(v.altPhone ?? ""),
    email: orNull(v.email ?? ""),
    location: orNull(v.location ?? ""),
    requirement: orNull(v.requirement ?? ""),
    // An untouched date keeps its stored instant, time of day included.
    nextActionAt: nextText === storedDay ? lead.nextActionAt : nextText ? new Date(nextText) : null,
    companyIds: has("companyIds") ? idList(form.companyIds) : before.companyIds,
  };

  const changed = EDITABLE_FIELDS.filter((k) => !sameValue(before[k], after[k]));

  if (lead.stageKind === "LOST" && changed.includes("nextActionAt") && after.nextActionAt) {
    throw new LeadEditError(
      "invalid",
      "A lost lead has no follow-ups to schedule — move it back to an open stage first.",
    );
  }

  return { before, after, changed };
}

function sameValue(a: unknown, b: unknown): boolean {
  if (a instanceof Date || b instanceof Date) {
    return a instanceof Date && b instanceof Date ? a.getTime() === b.getTime() : false;
  }
  if (Array.isArray(a) || Array.isArray(b)) {
    return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((x, i) => x === b[i]);
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

/** The shortest phoneKey treated as a real number. */
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
