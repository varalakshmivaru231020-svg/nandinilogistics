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
      {
        name: "projectId",
        label: "Project",
        kind: "select",
        source: "projects",
        emptyLabel: "None",
      },
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
      {
        name: "projectId",
        label: "Project",
        kind: "select",
        source: "projects",
        emptyLabel: "None",
      },
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

  /* ----------------------------------------------------------------- leads */

  // src/app/(app)/sales/leads/leads-screen.tsx → CaptureLead. Its fields are
  // the rows of Masters → Lead Settings, read when the form is served.
  "sales/leads:create": {
    key: "sales/leads:create",
    module: "sales/leads",
    title: "Capture lead",
    description: "Form is built from Masters → Lead Settings",
    submitLabel: "Save lead",
    permission: PERM.sales.lead.create,
    action: "sales/leads/createLead",
    shape: { kind: "formData" },
    done: "Lead captured.",
    dynamic: "leadFields",
    fields: [],
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
  /* --------------------------------------------------------------- vendors */

  // src/app/(app)/material/vendors/vendor-form.tsx
  "material/vendors:create": {
    key: "material/vendors:create",
    module: "material/vendors",
    title: "New vendor",
    description:
      "Vendor code is generated automatically. Only vendor name and mobile number are mandatory.",
    submitLabel: "Create vendor",
    permission: PERM.masters.vendor.create,
    action: "material/vendors/createVendor",
    shape: { kind: "positional", order: ["$values"] },
    done: "Vendor created.",
    fields: [
      {
        name: "name",
        label: "Vendor name",
        kind: "text",
        required: true,
        placeholder: "Sri Balaji Agencies",
        wide: true,
      },
      { name: "contactPerson", label: "Contact person", kind: "text", placeholder: "B. Ramesh" },
      {
        name: "phone",
        label: "Mobile number",
        kind: "phone",
        required: true,
        placeholder: "98450 00000",
      },
      { name: "email", label: "Email", kind: "email", placeholder: "sales@vendor.in" },
      { name: "gstin", label: "GSTIN", kind: "text", placeholder: "29ABCDE1234F1Z5", caps: true },
      { name: "pan", label: "PAN", kind: "text", placeholder: "ABCDE1234F", caps: true },
      // The design writes the terms in words; they are matched to the master.
      { name: "paymentTerms", label: "Payment terms", kind: "text", placeholder: "30 days credit" },
      {
        name: "accountNumber",
        label: "Bank account number",
        kind: "text",
        placeholder: "50100234567890",
      },
      { name: "ifsc", label: "IFSC code", kind: "text", placeholder: "HDFC0001234", caps: true },
      {
        name: "bankName",
        label: "Bank & branch",
        kind: "text",
        placeholder: "HDFC Bank · Mysore Road",
      },
      { name: "upiId", label: "UPI ID", kind: "text", placeholder: "sribalaji@okhdfcbank" },
      {
        name: "categoryIds",
        label: "Supply categories",
        kind: "multi",
        source: "itemCategories",
        wide: true,
      },
      {
        name: "addressLine",
        label: "Address",
        kind: "textarea",
        placeholder: "Yard address, city",
        wide: true,
      },
    ],
  },

  /* ------------------------------------------------------------- attendance */

  // src/app/(app)/hr/hr-screen.tsx → MarkTab. One line per active worker,
  // read when the form is served.
  "hr/attendance:mark": {
    key: "hr/attendance:mark",
    module: "hr/attendance",
    title: "Mark Attendance",
    submitLabel: "Save attendance",
    permission: PERM.hr.attendance.mark,
    action: "hr/markAttendance",
    shape: { kind: "positional", order: ["$attendanceOn", "$marks"] },
    done: "Attendance saved.",
    dynamic: "attendanceSheet",
    fields: [],
  },

  /* ------------------------------------------------------- site progress */

  // src/app/(app)/projects/progress/progress-screen.tsx → LogModal. The
  // photographs and the coordinates the web attaches are not sent from here:
  // there is no upload path at the boundary, and a log without them is still
  // the day's record.
  "projects/progress:create": {
    key: "projects/progress:create",
    module: "projects/progress",
    title: "Log site progress",
    submitLabel: "Save log",
    permission: PERM.project.progressLog.create,
    action: "projects/progress/createProgressLog",
    shape: { kind: "formData" },
    done: "Log saved.",
    fields: [
      { name: "projectId", label: "Project", kind: "select", required: true, source: "projects" },
      { name: "logDate", label: "Date", kind: "date", required: true },
      {
        name: "title",
        label: "What happened today",
        kind: "text",
        required: true,
        placeholder: "Slab shuttering — 7th floor",
        wide: true,
      },
      { name: "notes", label: "Notes", kind: "textarea", wide: true },
      { name: "manpowerCount", label: "Workers on site", kind: "number" },
      { name: "weather", label: "Weather", kind: "text", placeholder: "Clear / rain" },
    ],
  },

  /* ------------------------------------------------------------ price lists */

  // src/app/(app)/units/price-lists/price-lists-screen.tsx
  "units/price-lists:create": {
    key: "units/price-lists:create",
    module: "units/price-lists",
    title: "New price list version",
    submitLabel: "Publish version",
    permission: PERM.unit.priceList.create,
    action: "units/price-lists/createPriceList",
    shape: { kind: "formData" },
    done: "Price list version published.",
    fields: [
      { name: "projectId", label: "Project", kind: "select", required: true, source: "projects" },
      { name: "name", label: "Version name", kind: "text", required: true },
      { name: "effectiveFrom", label: "Effective from", kind: "date", required: true },
      { name: "baseRate", label: "Base rate (₹ per sq.ft)", kind: "money", required: true },
      { name: "floorRise", label: "Floor rise (₹ per sq.ft per floor)", kind: "money" },
      { name: "plcAmount", label: "PLC amount (₹)", kind: "money" },
    ],
  },

  /* -------------------------------------------------------------- transfers */

  // src/app/(app)/material/transfers/transfers-screen.tsx → NewTransferModal.
  // The web shows what each store holds as the quantity is typed; here the
  // action's own availability check is what refuses too much, and it names the
  // item and the quantity when it does.
  "material/transfers:create": {
    key: "material/transfers:create",
    module: "material/transfers",
    title: "New store transfer",
    description: "Stock moves only when the transfer is approved.",
    submitLabel: "Raise transfer",
    permission: PERM.material.transfer.create,
    action: "material/transfers/createTransfer",
    shape: { kind: "positional", order: ["$values"] },
    done: "Transfer raised.",
    fields: [
      {
        name: "fromStoreId",
        label: "From store",
        kind: "lookup",
        required: true,
        source: "stores2",
      },
      {
        name: "toStoreId",
        label: "To store",
        kind: "lookup",
        required: true,
        source: "stores2",
      },
      {
        name: "items",
        label: "Items",
        kind: "rows",
        addLabel: "Add line",
        minRows: 1,
        minRowsMessage: "Add at least one item",
        wide: true,
        row: [
          { name: "itemId", label: "Item", kind: "lookup", required: true, source: "items" },
          { name: "quantity", label: "Quantity", kind: "number", required: true },
        ],
      },
      { name: "remarks", label: "Remarks", kind: "textarea", wide: true },
    ],
  },

  /* ------------------------------------------------------------- checklists */

  // src/app/(app)/checklists/checklists-screen.tsx. The points are added to it
  // afterwards, one at a time, as they are on the web.
  "checklists:create": {
    key: "checklists:create",
    module: "checklists",
    title: "New checklist",
    submitLabel: "Save",
    permission: PERM.checklist.checklist.create,
    action: "checklists/saveChecklist",
    shape: { kind: "positional", order: [null, "$categoryId", "$values"] },
    done: "Checklist saved.",
    fields: [
      {
        name: "categoryId",
        label: "Category",
        kind: "select",
        required: true,
        source: "checklistCategories",
      },
      {
        name: "name",
        label: "Checklist name",
        kind: "text",
        required: true,
        placeholder: "e.g. Column casting QC",
        wide: true,
      },
      { name: "version", label: "Version", kind: "text", placeholder: "v1.0" },
    ],
  },

  /* -------------------------------------------------------- knowledge base */

  // src/app/(app)/kb/kb-screen.tsx → ArticleDrawer. The web's editor is rich
  // text and its attachments are files; this writes the words.
  "kb:create": {
    key: "kb:create",
    module: "kb",
    title: "New article",
    submitLabel: "Publish article",
    permission: PERM.kb.article.create,
    action: "kb/createArticle",
    shape: { kind: "formData" },
    done: "Article published.",
    fields: [
      {
        name: "title",
        label: "Name",
        kind: "text",
        required: true,
        placeholder: "e.g. Sales pitch — NN Riverview",
        wide: true,
      },
      { name: "body", label: "Description", kind: "textarea", required: true, wide: true },
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
