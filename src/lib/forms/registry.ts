import "server-only";

import { PERM } from "@/lib/permissions/codes";
import type { AuthContext } from "@/lib/rbac/context";

import type { FormDef, FormRef } from "./types";

/**
 * The forms, in the web's own words.
 *
 * Copied field by field from the modal or page each one mirrors — the label,
 * the placeholder, the hint, the `name` the action reads and the order they
 * appear in. Nothing here is invented: where the web says "On whom · they
 * accept before it is theirs", so does this.
 *
 * A form is served only to somebody holding its `permission`, and submitting
 * it calls the same server action the web calls, which authorizes again. This
 * registry decides what is *drawn*; it does not grant anything.
 */

const PEOPLE_SEARCH = "Search people…";

export const FORMS: Record<string, FormDef> = {
  /* ------------------------------------------------------------- calendar */

  // src/app/(app)/calendar/calendar-screen.tsx → NewCalendarTask
  "calendar:create": {
    key: "calendar:create",
    module: "calendar",
    title: "New calendar task",
    description:
      "A title, a timeline, and whoever it is on. They accept it before it lands on their calendar.",
    submitLabel: "Add to my calendar",
    permission: PERM.calendar.event.create,
    action: "calendar/createCalendarTask",
    shape: { kind: "formData" },
    done: "Calendar task added.",
    fields: [
      {
        name: "title",
        label: "Title",
        kind: "text",
        required: true,
        placeholder: "Site walk with the structural consultant",
        wide: true,
      },
      { name: "allDay", label: "Runs all day", kind: "checkbox", wide: true },
      {
        name: "startAt",
        label: "Starts",
        kind: "datetime",
        required: true,
        variant: { whenField: "allDay", label: "First day", kind: "date" },
      },
      {
        name: "endAt",
        label: "Ends",
        kind: "datetime",
        required: true,
        variant: { whenField: "allDay", label: "Last day", kind: "date" },
      },
      { name: "projectId", label: "Project", kind: "select", source: "projects" },
      { name: "location", label: "Where", kind: "text", placeholder: "Tower B · 6th floor" },
      {
        name: "description",
        label: "Details",
        kind: "textarea",
        placeholder: "What it is for, and anything to bring.",
        wide: true,
      },
      {
        name: "attendeeIds",
        label: "On whom",
        note: "they accept before it is theirs",
        kind: "multi",
        source: "people",
        placeholder: PEOPLE_SEARCH,
        wide: true,
      },
    ],
  },

  /* ---------------------------------------------------------------- tasks */

  // src/app/(app)/tasks/new/new-task-form.tsx
  "tasks:create": {
    key: "tasks:create",
    module: "tasks",
    title: "New task",
    description: "Assigned to one person, who accepts it and owns it until it closes.",
    submitLabel: "Assign task",
    permission: PERM.task.task.create,
    action: "tasks/createTask",
    shape: { kind: "formData" },
    done: "Task raised.",
    fields: [
      {
        name: "title",
        label: "Title",
        kind: "text",
        required: true,
        placeholder: "Snag the 8th floor handover",
        wide: true,
      },
      {
        name: "description",
        label: "Description",
        kind: "textarea",
        placeholder: "Details and instructions",
        wide: true,
      },
      {
        name: "assigneeId",
        label: "Assign to",
        kind: "lookup",
        required: true,
        source: "people",
        hint: "Type a name, an employee code or a mobile number.",
        placeholder: PEOPLE_SEARCH,
      },
      {
        name: "priority",
        label: "Priority",
        kind: "select",
        required: true,
        initial: "MEDIUM",
        options: [
          { value: "HIGH", label: "High" },
          { value: "MEDIUM", label: "Medium" },
          { value: "LOW", label: "Low" },
        ],
      },
      {
        name: "dueAt",
        label: "Due date and time",
        kind: "datetime",
        required: true,
        hint: "Must be in the future.",
      },
      { name: "projectId", label: "Project", kind: "select", source: "projects" },
      { name: "location", label: "Location", kind: "text", placeholder: "Tower B · Fl 8", wide: true },
      {
        name: "checklistIds",
        label: "Checklist",
        note: "Optional — it adds review and approval levels",
        kind: "multi",
        source: "checklists",
        placeholder: "Search checklists by name or category…",
        wide: true,
      },
      {
        name: "reviewerIds",
        label: "Reviewers",
        note: "They check the work, in order. Level 1 is the person doing it.",
        kind: "multi",
        source: "people",
        placeholder: PEOPLE_SEARCH,
        leadWith: "assigneeId",
        wide: true,
      },
      {
        name: "approverIds",
        label: "Approvers",
        note: "They sign it off after the reviews, in order. The last approval closes the task.",
        kind: "multi",
        source: "people",
        placeholder: PEOPLE_SEARCH,
        wide: true,
      },
    ],
  },

  /* ------------------------------------------------------------ customers */

  // src/app/(app)/sales/customers/customers-screen.tsx → NewCustomer
  "sales/customers:create": {
    key: "sales/customers:create",
    module: "sales/customers",
    title: "New customer",
    description: "PAN is required before KYC can be verified.",
    submitLabel: "Create customer",
    permission: PERM.sales.customer.create,
    action: "sales/bookings/createCustomer",
    shape: { kind: "formData" },
    done: "Customer created.",
    fields: [
      { name: "name", label: "Name", kind: "text", required: true },
      { name: "phone", label: "Phone", kind: "phone", required: true },
      { name: "email", label: "Email", kind: "email" },
      { name: "panNumber", label: "PAN", kind: "text", placeholder: "ABCDE1234F", caps: true },
      { name: "aadhaarNumber", label: "Aadhaar", kind: "text" },
      { name: "addressLine", label: "Address", kind: "textarea", wide: true },
    ],
  },

  /* -------------------------------------------------------------- indents */

  // src/app/(app)/material/indents/new/indent-form.tsx
  //
  // The work front is typed over a list of the project's packages, and the
  // rates come from the item master — both now settled by the action itself
  // rather than by the web form, so this one sends neither.
  "material/indents:create": {
    key: "material/indents:create",
    module: "material/indents",
    title: "Raise requirement indent",
    description:
      "Internal request to the store — the store issues from stock and raises a PO only for the shortfall.",
    submitLabel: "Save as draft",
    permission: PERM.material.indent.create,
    action: "material/indents/createIndent",
    shape: { kind: "positional", order: ["$values", false] },
    done: "Indent saved as a draft.",
    // Whoever may submit one raises it and sends it for approval, as on the web.
    when: {
      permission: PERM.material.indent.submit,
      submitLabel: "Raise indent & send for approval",
      shape: { kind: "positional", order: ["$values", true] },
      done: "Indent raised and sent for approval.",
    },
    fields: [
      { name: "projectId", label: "Project", kind: "select", required: true, source: "projects" },
      { name: "requiredByDate", label: "Required by", kind: "date", required: true },
      {
        name: "purpose",
        label: "Activity / work front",
        kind: "suggest",
        required: true,
        source: "workPackages",
        placeholder: "Slab casting floor 7",
      },
      {
        name: "remarks",
        label: "Remarks",
        kind: "textarea",
        required: true,
        placeholder: "e.g. needed before the pour on 10 Sep, deliver to floor 7 hoist…",
        wide: true,
      },
      {
        name: "items",
        label: "Requested items",
        kind: "rows",
        addLabel: "Add item",
        minRows: 1,
        minRowsMessage: "Add at least one item",
        wide: true,
        /*
         * The web adds items from a search pane and then shows each line as
         * the item's own name with a quantity box beside it. On a phone the
         * line carries its own picker — the one label here the web does not
         * write, because there the item is a heading rather than a field.
         * It does not collect a specification on create, and neither does this.
         */
        row: [
          {
            name: "itemId",
            label: "Item",
            kind: "lookup",
            required: true,
            source: "items",
            placeholder: "Search item name or code…",
          },
          { name: "requestedQty", label: "Reqd qty", kind: "number", required: true },
        ],
      },
    ],
  },
};

/** Every form defined against a list or record. */
export function formsFor(module: string): FormDef[] {
  return Object.values(FORMS).filter((f) => f.module === module);
}

/**
 * The forms a screen may offer, which is what puts its "New …" button there.
 *
 * Only the ones this viewer holds the permission for, because the design's
 * rule is that a control somebody cannot use is not drawn. The action
 * authorizes again regardless.
 */
export function formRefsFor(ctx: AuthContext, module: string): FormRef[] {
  return formsFor(module)
    .filter((f) => !f.onRecord && ctx.has(f.permission))
    .map((f) => ({ key: f.key, title: f.title, submitLabel: f.submitLabel }));
}
