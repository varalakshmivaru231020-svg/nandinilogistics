import "server-only";

import type { ResolvedField } from "@/lib/forms/types";

/**
 * One record, in full, as a client that is not the web screen needs it.
 *
 * The Android client had no such thing: every detail screen was built from the
 * row the list gave it, so a task had no checklist, an indent had no lines, and
 * nothing could be done to anything. A list row is a summary — it is not a
 * record, and pretending otherwise is why "99% of the actions are missing".
 *
 * The shape is deliberately not a Prisma model. It is what a screen shows:
 * a heading, some pills, sections of labelled fields, the child collections
 * that belong to it, and **what this viewer may do to it right now** — decided
 * here, by the same helpers the web screen asks, so the phone cannot offer a
 * button the web would refuse.
 */

export type Tone = "good" | "warn" | "bad" | "plum" | "info" | "draft";
export type FieldFormat = "text" | "money" | "date" | "datetime" | "number" | "bool";

export interface RecordField {
  label: string;
  value: string | number | boolean | null;
  format?: FieldFormat;
  /** A long value — remarks, an address — gets a line of its own. */
  wide?: boolean;
}

export interface RecordSection {
  label: string;
  fields: RecordField[];
}

/** A row inside a child collection — an item line, a comment, a checklist point. */
export interface CollectionRow {
  id: string;
  title: string;
  subtitle?: string | null;
  /** The figure on the right — a quantity, a value. */
  trailing?: string | null;
  pills?: Array<{ label: string; tone: Tone }>;
  /** A long body, for a comment or a note. */
  body?: string | null;
  /** What may be done to this row, as opposed to the record. */
  actions?: RecordAction[];
}

export interface RecordCollection {
  key: string;
  /** "3 items · ₹5.95 L" — the web's own summary line. */
  label: string;
  rows: CollectionRow[];
  emptyMessage?: string;
}

/**
 * Something this viewer may do, with the action to call and the arguments to
 * call it with.
 *
 * The client never maps a status to an action. It is told.
 */
export interface RecordAction {
  /** A stable name, for the client to key a button off. */
  key: string;
  /** What the button says — the web's own wording. */
  label: string;
  emphasis: "primary" | "approve" | "reject" | "outline";
  /** The mobile action registry key. */
  action: string;
  /**
   * Positional arguments before the remark. A string of the form `$name` is
   * the value of the field of that name in `fields`, which is how an action
   * that needs more than a remark — a new finish date, an amount — is called.
   */
  args: unknown[];
  /**
   * What else the confirmation sheet collects. Extending a calendar task needs
   * the new finish as well as the reason, and the web asks for both in one
   * dialog rather than two.
   */
  fields?: ResolvedField[];
  remark: "none" | "optional" | "required";
  remarkLabel?: string;
  /** What the confirmation sheet says will happen. */
  confirm?: string;
}

export interface RecordView {
  key: string;
  id: string;
  title: string;
  subtitle: string | null;
  pills: Array<{ label: string; tone: Tone }>;
  /** Raised → PM → Store → Issued, where the record has a chain. */
  chain?: Array<{ initials: string; state: "done" | "current" | "pending" }>;
  sections: RecordSection[];
  collections: RecordCollection[];
  actions: RecordAction[];
  serverTime: string;
}

/** The tone a status word carries, by what it means. */
export function toneOf(raw: string): Tone {
  const s = raw.toUpperCase().replace(/_/g, " ");
  if (/REJECT|CANCEL|MISMATCH|DELAY|LOST|BLOCK|BOUNCE|FAIL/.test(s)) return "bad";
  if (/APPROVED|POSTED|PAID|COMPLETED|CLOSED|RECEIVED|MATCHED|REGISTERED|ACTIVE|BOOKED|PUBLISHED|PASS/.test(s)) {
    return "good";
  }
  if (/PENDING|SUBMITTED|HOLD|PROGRESS|PARTIAL|HELD|REWORK|INSPECTED|STARTED/.test(s)) return "warn";
  if (/REVIEW|APPROVAL|NEGOTIATION|AGREEMENT/.test(s)) return "plum";
  if (/AVAILABLE|NEW|CONTACTED|ACCEPTED/.test(s)) return "info";
  return "draft";
}

/** A status in the words the badges use. */
export function words(raw: string): string {
  return raw.replace(/_/g, " ");
}
