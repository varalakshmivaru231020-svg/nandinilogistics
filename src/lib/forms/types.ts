import "server-only";

import type { OptionSource } from "@/lib/screens/registry";

/**
 * A form, as the web draws it, described so another client can draw the same one.
 *
 * The Android app could read every list and every record but could not *make*
 * anything: there was no create screen in it at all, because a list row and a
 * record both describe something that already exists. A form is the third
 * shape, and it is the one the report was about — "99% of the cruds are
 * missing".
 *
 * These definitions are deliberately the web modal's own words: "New customer",
 * "PAN is required before KYC can be verified", "Create customer", `panNumber`,
 * the `ABCDE1234F` placeholder. `tests/unit/form-registry.test.ts` reads the
 * screen sources and fails when a label, a field name or a hint here stops
 * matching the modal it was copied from, so the two cannot drift.
 */

export type FieldKind =
  | "text"
  | "textarea"
  /** A plain number — a quantity, a count. */
  | "number"
  /** Rupees. The client shows it in Indian numbering and sends a number. */
  | "money"
  | "date"
  | "datetime"
  | "select"
  /** A select whose list is long enough to need a search box. */
  | "lookup"
  /**
   * Free text over a list of suggestions, which is what a `<datalist>` is: the
   * indent's work front may be typed, and ties to a work package where the
   * words match one.
   */
  | "suggest"
  | "checkbox"
  | "phone"
  | "email"
  /** Several people, as the calendar's "On whom" picker collects. */
  | "multi"
  /** Repeating lines — the items of an indent, a transfer, an issue. */
  | "rows";

export interface FormFieldDef {
  /** The name the action reads — `panNumber`, not "PAN". */
  name: string;
  /** What the web's `<Field label>` says. */
  label: string;
  kind: FieldKind;
  required?: boolean;
  /** The web's own hint line, where it has one. */
  hint?: string;
  placeholder?: string;
  /** Typed out where the list is a constant; `source` where it is a query. */
  options?: ReadonlyArray<{ value: string; label: string }>;
  source?: OptionSource;
  /** Upper-cases as it is typed, as the web's PAN field does. */
  caps?: boolean;
  /**
   * What the nothing-chosen option is called. The web writes it differently in
   * different places — "None" over the calendar's project, "Select…" on the
   * lead drawer, "— From the lead —" where the lead's own project stands in —
   * and that wording is the instruction, so it travels.
   */
  emptyLabel?: string;
  /** A line of its own, rather than half a row. */
  wide?: boolean;
  /**
   * Carried and submitted but never drawn — the id of the line a quantity
   * belongs to, which the client has no business letting anybody edit.
   */
  hidden?: boolean;
  /** Where the web pre-fills it with something other than empty. */
  initial?: string | number | boolean;
  /**
   * What this field becomes while another one is ticked. The calendar's
   * "Starts" is "First day" and takes a date rather than an instant once
   * "Runs all day" is on, and the phone has to do the same or it will send
   * an instant the action rejects.
   */
  variant?: { whenField: string; label: string; kind?: FieldKind };
  /** For `rows`: the fields of one line, and what the add button says. */
  row?: ReadonlyArray<FormFieldDef>;
  addLabel?: string;
  /**
   * For `rows`: lines that are already there, each a map of field name to its
   * starting value. Receiving a transfer is every line it was sent with, each
   * pre-filled with what left the store — the decision is how much of that
   * actually arrived, so the lines cannot be invented or dropped.
   *
   * The reserved key `_label` names the line instead of "Line 1".
   */
  initialRows?: ReadonlyArray<Record<string, string | number | boolean>>;
  /** For `rows`: the lines are fixed — none may be added or removed. */
  fixedRows?: boolean;
  /** For `rows`: the fewest lines the action will accept, and its message. */
  minRows?: number;
  minRowsMessage?: string;
  /**
   * For `multi`: another field whose value is sent as the first entry. Review
   * level 1 on a task is the assignee — the web puts their name in the first
   * slot and will not let it be changed, and the action reads the list in
   * level order, so the phone has to send it the same way round.
   */
  leadWith?: string;
  /** The web's small print under a label, where it carries one. */
  note?: string;
}

/** How the collected values become the arguments of a server action. */
export type FormShape =
  /** One `FormData` argument, as `createCustomerAction(formData)` takes. */
  | { kind: "formData" }
  /**
   * Positional arguments, named. `$field` is that field's value, `$values` is
   * every field as one object (what an action taking a parsed input takes),
   * `$id` is the record the form was opened on, and anything else is passed
   * as the literal it is.
   */
  | { kind: "positional"; order: ReadonlyArray<string | boolean | number | null> };

export interface FormDef {
  /** "sales/customers:create" — the module, then what the form does. */
  key: string;
  /** The list or record this belongs to, so a screen can offer it. */
  module: string;
  /** The modal's title, verbatim. */
  title: string;
  /** Its description line, where it has one. */
  description?: string;
  /** What the submit button says — "Create customer", not "Save". */
  submitLabel: string;
  /** The permission the web button is drawn under, re-checked when served. */
  permission: string;
  /** The mobile action registry key. */
  action: string;
  shape: FormShape;
  fields: ReadonlyArray<FormFieldDef>;
  /** What to say once it worked. */
  done?: string;
  /** Opened on an existing record rather than from a list's "New" button. */
  onRecord?: boolean;
  /**
   * An edit form, whose fields start as the record stands. The values come
   * from `prefillFor()`, keyed by this form's key, and a field the record
   * cannot change comes back locked.
   */
  edits?: boolean;
  /**
   * A form whose fields are not fixed. "Capture lead" is whatever Masters →
   * Lead Settings says it is, and the attendance sheet is one line per active
   * worker — both are read when the form is served rather than written here.
   */
  dynamic?: "leadFields" | "attendanceSheet";
  /**
   * What the form becomes for somebody holding a further permission. The
   * indent's own button reads "Raise indent & send for approval" for whoever
   * may submit one and "Save as draft" for whoever may not, and the second
   * argument the action takes follows it.
   */
  when?: {
    permission: string;
    submitLabel?: string;
    shape?: FormShape;
    done?: string;
  };
}

/** A form a screen offers, as its "New …" button needs it. */
export interface FormRef {
  key: string;
  title: string;
  submitLabel: string;
}

/** A field with its options filled in, which is what the client is sent. */
export interface ResolvedField extends Omit<FormFieldDef, "source" | "options" | "row"> {
  options?: Array<{ value: string; label: string; hint?: string }>;
  row?: ResolvedField[];
}

export interface ResolvedForm extends Omit<FormDef, "fields" | "permission" | "when"> {
  fields: ResolvedField[];
  serverTime: string;
}
