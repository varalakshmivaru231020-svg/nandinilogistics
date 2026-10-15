import "server-only";

import { PERM } from "@/lib/permissions/codes";
import { PROJECT_STATUSES, PROJECT_STATUS_LABEL } from "@/lib/projects/list-filters";
import type { AuthContext } from "@/lib/rbac/context";

import type { FormDef, FormFieldDef, FormRef } from "./types";

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

const PROJECT_FIELDS: ReadonlyArray<FormFieldDef> = [
  {
    name: "name",
    label: "Project name",
    kind: "text",
    required: true,
    placeholder: "e.g. NN Lakefront",
    wide: true,
  },
  { name: "code", label: "Project code", kind: "text", required: true, placeholder: "PRJ-005" },
  { name: "projectTypeId", label: "Project type", kind: "select", required: true, source: "projectTypes" },
  { name: "addressLine", label: "Location", kind: "text", placeholder: "Area, city", wide: true },
  { name: "landAreaText", label: "Land area", kind: "text", placeholder: "4.2 acres" },
  {
    name: "reraNumber",
    label: "RERA registration no.",
    kind: "text",
    placeholder: "PRM/KA/RERA/…",
    wide: true,
  },
  {
    name: "approvalDetails",
    label: "Approval details",
    kind: "text",
    placeholder: "plan sanction ref.",
    wide: true,
  },
  { name: "totalTowers", label: "Towers / blocks", kind: "number", placeholder: "2" },
  { name: "totalFloors", label: "Floors per tower", kind: "number", placeholder: "18" },
  { name: "totalUnits", label: "Total units", kind: "number", placeholder: "456" },
  { name: "startDate", label: "Planned start", kind: "date" },
  { name: "targetDate", label: "Target completion", kind: "date" },
];

const CALENDAR_FIELDS: ReadonlyArray<FormFieldDef> = [
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
    ];

const TASK_FIELDS: ReadonlyArray<FormFieldDef> = [
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
    ];

const VENDOR_FIELDS: ReadonlyArray<FormFieldDef> = [
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
    ];

const ARTICLE_FIELDS: ReadonlyArray<FormFieldDef> = [
      {
        name: "title",
        label: "Name",
        kind: "text",
        required: true,
        placeholder: "e.g. Sales pitch — NN Riverview",
        wide: true,
      },
      { name: "body", label: "Description", kind: "textarea", required: true, wide: true },
    ];


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
    fields: CALENDAR_FIELDS,
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
    fields: TASK_FIELDS,
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
    fields: VENDOR_FIELDS,
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
    fields: ARTICLE_FIELDS,
  },
  /* =======================================================================
   * Edits.
   *
   * Each one is the create form's own field list — the same const, so the two
   * cannot drift — opened on a record, with `edits: true` so the fields come
   * back holding what the record holds. The web uses one component for both
   * in every case but the lead, whose edit drawer is its own.
   * ===================================================================== */

  /*
   * The web has `updateCalendarTaskAction` and no screen that calls it, so
   * these words are the app's own — see docs/MOBILE_PARITY.md, where the
   * asymmetry is written down rather than left to be discovered.
   */
  "calendar:edit": {
    key: "calendar:edit",
    module: "calendar",
    title: "Edit calendar task",
    submitLabel: "Save changes",
    permission: PERM.calendar.event.update,
    action: "calendar/updateCalendarTask",
    shape: { kind: "positional", order: ["$id", "$values"] },
    done: "Calendar task changed.",
    onRecord: true,
    edits: true,
    fields: CALENDAR_FIELDS,
  },

  /*
   * The same asymmetry: `canDo("edit")` is in the task lifecycle and
   * `updateTaskAction` enforces it — the Assigner may correct a task until
   * work starts — but no web screen offers it.
   */
  "tasks:edit": {
    key: "tasks:edit",
    module: "tasks",
    title: "Edit task",
    submitLabel: "Save changes",
    permission: PERM.task.task.update,
    action: "tasks/updateTask",
    shape: { kind: "positional", order: ["$id", "$values"] },
    done: "Task changed.",
    onRecord: true,
    edits: true,
    // The checklist and its levels are set when a task is raised, so the edit
    // form is the task's own fields — exactly what the web's edit screen takes.
    fields: TASK_FIELDS.filter(
      (f) => !["checklistIds", "reviewerIds", "approverIds"].includes(f.name),
    ),
  },

  "material/vendors:edit": {
    key: "material/vendors:edit",
    module: "material/vendors",
    title: "Edit vendor",
    description:
      "Vendor code is generated automatically. Only vendor name and mobile number are mandatory.",
    submitLabel: "Save vendor",
    permission: PERM.masters.vendor.update,
    action: "material/vendors/updateVendor",
    shape: { kind: "positional", order: ["$id", "$values"] },
    done: "Vendor changed.",
    onRecord: true,
    edits: true,
    fields: VENDOR_FIELDS,
  },

  "kb:edit": {
    key: "kb:edit",
    module: "kb",
    title: "Edit article",
    submitLabel: "Save changes",
    permission: PERM.kb.article.update,
    action: "kb/updateArticle",
    shape: { kind: "positional", order: ["$id", "$values"] },
    done: "Article changed.",
    onRecord: true,
    edits: true,
    fields: ARTICLE_FIELDS,
  },

  // src/app/(app)/sales/leads/[id]/lead-edit-modal.tsx — its own drawer, with
  // the stale guard the action checks and the fields a booked lead cannot
  // change.
  "sales/leads:edit": {
    key: "sales/leads:edit",
    module: "sales/leads",
    title: "Edit lead",
    submitLabel: "Save changes",
    permission: PERM.sales.lead.update,
    action: "sales/leads/updateLead",
    shape: { kind: "positional", order: ["$id", "$values"] },
    done: "Lead changed.",
    onRecord: true,
    edits: true,
    fields: [
      { name: "name", label: "Name", kind: "text", required: true },
      { name: "phone", label: "Phone", kind: "phone", required: true },
      { name: "altPhone", label: "Alternate phone", kind: "phone" },
      { name: "email", label: "Email", kind: "email" },
      { name: "sourceId", label: "Source", kind: "select", required: true, source: "leadSources" },
      {
        name: "projectId",
        label: "Project of interest",
        kind: "select",
        source: "projects",
        emptyLabel: "Select…",
      },
      {
        name: "unitTypeId",
        label: "Interested in",
        kind: "select",
        source: "unitTypes",
        hint: "Matched against available inventory.",
        emptyLabel: "Select…",
      },
      { name: "budgetMin", label: "Budget from (₹)", kind: "money" },
      { name: "budgetMax", label: "Budget to (₹)", kind: "money" },
      {
        name: "requirement",
        label: "Requirement",
        kind: "textarea",
        placeholder: "2–3 BHK, east facing, ready to move",
        wide: true,
      },
      { name: "nextActionAt", label: "Next action on", kind: "date" },
      // The stale guard the action compares against, carried not drawn.
      { name: "updatedAt", label: "Unchanged since", kind: "text", hidden: true },
    ],
  },

  // src/app/(app)/hr/hr-screen.tsx → EmployeeDrawer, without the photograph
  // and the identity copies, which are files.
  "hr/employees:edit": {
    key: "hr/employees:edit",
    module: "hr/employees",
    title: "Edit employee",
    submitLabel: "Save changes",
    permission: PERM.hr.employee.update,
    action: "hr/updateEmployee",
    shape: { kind: "positional", order: ["$id", "$values"] },
    done: "Employee changed.",
    onRecord: true,
    edits: true,
    fields: [
      {
        name: "employmentTypeId",
        label: "Type of employment",
        kind: "select",
        required: true,
        source: "employmentTypes",
      },
      { name: "name", label: "Name", kind: "text", required: true, placeholder: "Full name" },
      { name: "designationId", label: "Designation", kind: "select", source: "designations" },
      { name: "mobile", label: "Mobile number", kind: "phone", required: true, placeholder: "98765 43210" },
      {
        name: "aadhaar",
        label: "Aadhaar number",
        kind: "text",
        required: true,
        placeholder: "1234 5678 9012",
      },
      { name: "pan", label: "PAN", kind: "text", placeholder: "ABCDE1234F", caps: true },
      { name: "altContact", label: "Alternate number", kind: "phone", placeholder: "+91 90000 00000" },
      {
        name: "address",
        label: "Address",
        kind: "textarea",
        placeholder: "House, area, city",
        wide: true,
      },
    ],
  },

  // src/app/(app)/schedule/schedule-screen.tsx → EditActivityModal. The
  // baseline is not here and never will be — it is what slippage is measured
  // against.
  "schedule/activities:edit": {
    key: "schedule/activities:edit",
    module: "schedule/activities",
    // The web's own title carries the activity's code — "Edit EXC".
    title: "Edit activity",
    description: "The baseline stays where it was — it is what slippage is measured against.",
    submitLabel: "Save",
    permission: PERM.schedule.activity.update,
    action: "schedule/updateActivity",
    shape: { kind: "positional", order: ["$id", "$name", "$plannedStart", "$plannedEnd"] },
    done: "Activity corrected.",
    onRecord: true,
    edits: true,
    fields: [
      { name: "name", label: "Activity name", kind: "text", required: true, wide: true },
      { name: "plannedStart", label: "Planned start", kind: "date", required: true },
      { name: "plannedEnd", label: "Planned finish", kind: "date", required: true },
    ],
  },

  // src/app/(app)/units/unit-manager.tsx → UnitFormModal. The project and the
  // block cannot move, so they are not on the edit form at all.
  // src/app/(app)/material/indents/new/indent-form.tsx, opened on an indent.
  // The project is fixed and the rates come from the item master — the edit
  // schema's own comment says so.
  "material/indents:edit": {
    key: "material/indents:edit",
    module: "material/indents",
    title: "Edit requirement indent",
    submitLabel: "Save indent",
    permission: PERM.material.indent.update,
    action: "material/indents/updateIndent",
    shape: { kind: "positional", order: ["$id", "$values"] },
    done: "Indent changed.",
    onRecord: true,
    edits: true,
    fields: [
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
        row: [
          { name: "id", label: "Line", kind: "text", hidden: true },
          {
            name: "itemId",
            label: "Item",
            kind: "lookup",
            required: true,
            source: "items",
            placeholder: "Search item name or code…",
          },
          { name: "requestedQty", label: "Reqd qty", kind: "number", required: true },
          { name: "specification", label: "Specification", kind: "text", hidden: true },
        ],
      },
    ],
  },

  // src/app/(app)/material/purchase-orders/new/po-form.tsx, opened on an
  // order. The project cannot move, so it is not here.
  "material/purchase-orders:edit": {
    key: "material/purchase-orders:edit",
    module: "material/purchase-orders",
    title: "Edit purchase order",
    description: "Raised POs go to Project Manager, then Admin.",
    submitLabel: "Save order",
    permission: PERM.material.purchaseOrder.update,
    action: "material/purchase-orders/updatePurchaseOrder",
    shape: { kind: "positional", order: ["$id", "$values"] },
    done: "Order changed.",
    onRecord: true,
    edits: true,
    fields: [
      {
        name: "vendorId",
        label: "Vendor",
        kind: "lookup",
        required: true,
        source: "vendors",
        placeholder: "Search vendor by name, code or number…",
      },
      { name: "expectedDate", label: "Delivery due", kind: "date" },
      {
        name: "terms",
        label: "Payment & delivery terms",
        kind: "text",
        placeholder: "30 days credit · delivery at site",
        wide: true,
      },
      {
        name: "deliveryAddress",
        label: "Remarks",
        kind: "textarea",
        placeholder: "e.g. deliver in two lots, unload at basement gate…",
        wide: true,
      },
      // The web's own form has no input for other charges — it carries
      // whatever the order already had, so this does the same, unseen.
      { name: "otherCharges", label: "Other charges", kind: "money", hidden: true },
      {
        name: "items",
        label: "Order lines",
        kind: "rows",
        addLabel: "Add line",
        minRows: 1,
        minRowsMessage: "Add at least one item",
        wide: true,
        row: [
          { name: "id", label: "Line", kind: "text", hidden: true },
          {
            name: "itemId",
            label: "Item",
            kind: "lookup",
            required: true,
            source: "items",
            placeholder: "Search item name or code…",
          },
          { name: "orderedQty", label: "Qty", kind: "number", required: true },
          { name: "rate", label: "Rate ₹", kind: "money", required: true },
          // None of these three is drawn on the web's own form: the tax comes
          // from the item master and the other two are carried. All three ride
          // along so an edit sends back what it was given.
          { name: "taxPct", label: "GST %", kind: "number", hidden: true },
          { name: "discountPct", label: "Disc %", kind: "number", hidden: true },
          { name: "specification", label: "Specification", kind: "text", hidden: true },
        ],
      },
    ],
  },

  // src/app/(app)/material/grn/[id]/edit — the paperwork only. Quantities are
  // not editable once the receipt is in the stock ledger, which is every
  // posted receipt; those are corrected with a stock adjustment.
  "material/grn:edit": {
    key: "material/grn:edit",
    module: "material/grn",
    // Its own title carries the receipt's number — "Edit GRN/NNS/…" — and its
    // description the order it is against.
    title: "Edit goods receipt",
    submitLabel: "Save",
    permission: PERM.material.grn.update,
    action: "material/grn/updateGrn",
    shape: { kind: "positional", order: ["$id", "$values", "$expectedUpdatedAt"] },
    done: "Goods receipt changed.",
    onRecord: true,
    edits: true,
    fields: [
      { name: "challanNo", label: "Challan no.", kind: "text" },
      { name: "challanDate", label: "Challan date", kind: "date" },
      { name: "vehicleNo", label: "Vehicle no.", kind: "text", caps: true },
      { name: "remarks", label: "Remarks", kind: "textarea", wide: true },
      // The stale guard the action compares against, carried not drawn.
      { name: "expectedUpdatedAt", label: "Unchanged since", kind: "text", hidden: true },
    ],
  },

  /* ------------------------------------------------------------- projects */

  // src/app/(app)/projects/new-project-button.tsx. The breakdown the web's
  // dialog can carry is optional on the action, and is built on the web or
  // from the schedule — a phone raises the project.
  "projects/projects:create": {
    key: "projects/projects:create",
    module: "projects/projects",
    title: "Create project",
    submitLabel: "Create project",
    permission: PERM.project.project.create,
    action: "projects/createProject",
    shape: { kind: "formData" },
    done: "Project created.",
    fields: PROJECT_FIELDS,
  },

  // src/app/(app)/projects/[id]/edit-project-button.tsx — the same fields with
  // the status, which only an existing project has.
  "projects/projects:edit": {
    key: "projects/projects:edit",
    module: "projects/projects",
    title: "Edit project",
    submitLabel: "Save",
    permission: PERM.project.project.update,
    action: "projects/updateProject",
    shape: { kind: "positional", order: ["$id", "$values"] },
    done: "Project changed.",
    onRecord: true,
    edits: true,
    // The same particulars, plus the two its own screen adds: the city and
    // the status, which only a project that exists has.
    fields: [
      // Its own screen places only four of the create dialog's placeholders.
      ...PROJECT_FIELDS.map((f) =>
        ["addressLine", "landAreaText", "reraNumber", "approvalDetails"].includes(f.name)
          ? f
          : { ...f, placeholder: undefined },
      ),
      { name: "cityId", label: "City", kind: "select", source: "cities" },
      {
        name: "status",
        label: "Status",
        kind: "select",
        required: true,
        options: PROJECT_STATUSES.map((v) => ({ value: v, label: PROJECT_STATUS_LABEL[v] })),
      },
    ],
  },

  /* ---------------------------------------------------------------- units */

  // src/app/(app)/units/unit-manager.tsx → UnitFormModal, raising one flat.
  "units:create": {
    key: "units:create",
    module: "units",
    title: "New unit",
    submitLabel: "Create unit",
    permission: PERM.unit.unit.create,
    action: "units/createUnit",
    shape: { kind: "formData" },
    done: "Unit created.",
    fields: [
      { name: "projectId", label: "Project", kind: "select", required: true, source: "projects" },
      { name: "blockId", label: "Block", kind: "lookup", required: true, source: "blocks" },
      { name: "unitNumber", label: "Unit number", kind: "text", required: true, placeholder: "A-0101" },
      { name: "unitTypeId", label: "Unit type", kind: "select", required: true, source: "unitTypes" },
      { name: "floorNumber", label: "Floor", kind: "number", required: true, hint: "0 for ground." },
      { name: "carpetArea", label: "Carpet area (sq.ft)", kind: "number", required: true },
      { name: "builtUpArea", label: "Built-up area (sq.ft)", kind: "number" },
      {
        name: "superBuiltUpArea",
        label: "Super built-up area (sq.ft)",
        kind: "number",
        required: true,
        hint: "The area rates apply to.",
      },
      { name: "facing", label: "Facing", kind: "text", placeholder: "East" },
      { name: "plcTag", label: "PLC tag", kind: "text", hint: "e.g. CORNER, PARK_FACING" },
      { name: "parkingSlots", label: "Parking slots", kind: "number" },
    ],
  },

  /* ------------------------------------------------------------- schedule */

  // src/app/(app)/schedule/schedule-screen.tsx → AddPanel, whose two modes are
  // a main category and a sub-activity under one.
  "schedule/activities:addCategory": {
    key: "schedule/activities:addCategory",
    module: "schedule/activities",
    title: "Main category",
    submitLabel: "Add",
    permission: PERM.schedule.activity.create,
    action: "schedule/addMainCategory",
    shape: { kind: "positional", order: ["$projectId", "$name", "$plannedStart", "$plannedEnd"] },
    done: "Main category added.",
    fields: [
      { name: "projectId", label: "Project", kind: "select", required: true, source: "projects" },
      { name: "name", label: "Name", kind: "text", required: true, placeholder: "e.g. Slab 4", wide: true },
      { name: "plannedStart", label: "Planned start", kind: "date", required: true },
      { name: "plannedEnd", label: "Planned end", kind: "date", required: true },
    ],
  },

  "schedule/activities:addActivity": {
    key: "schedule/activities:addActivity",
    module: "schedule/activities",
    title: "Sub-activity",
    submitLabel: "Add",
    permission: PERM.schedule.activity.create,
    action: "schedule/addSubActivity",
    shape: {
      kind: "positional",
      order: ["$projectId", "$workPackageId", "$name", "$plannedStart", "$plannedEnd"],
    },
    done: "Sub-activity added.",
    fields: [
      { name: "projectId", label: "Project", kind: "select", required: true, source: "projects" },
      {
        name: "workPackageId",
        label: "Under which main category",
        kind: "lookup",
        required: true,
        source: "workPackages",
      },
      { name: "name", label: "Name", kind: "text", required: true, placeholder: "e.g. Slab 4", wide: true },
      { name: "plannedStart", label: "Planned start", kind: "date", required: true },
      { name: "plannedEnd", label: "Planned end", kind: "date", required: true },
    ],
  },

  "units:edit": {
    key: "units:edit",
    module: "units",
    title: "Edit unit",
    submitLabel: "Save unit",
    permission: PERM.unit.unit.update,
    action: "units/updateUnit",
    shape: { kind: "positional", order: ["$id", "$values"] },
    done: "Unit changed.",
    onRecord: true,
    edits: true,
    fields: [
      { name: "unitNumber", label: "Unit number", kind: "text", required: true, placeholder: "A-0101" },
      { name: "unitTypeId", label: "Unit type", kind: "select", required: true, source: "unitTypes" },
      { name: "floorNumber", label: "Floor", kind: "number", required: true, hint: "0 for ground." },
      { name: "carpetArea", label: "Carpet area (sq.ft)", kind: "number", required: true },
      { name: "builtUpArea", label: "Built-up area (sq.ft)", kind: "number" },
      {
        name: "superBuiltUpArea",
        label: "Super built-up area (sq.ft)",
        kind: "number",
        required: true,
        hint: "The area rates apply to.",
      },
      { name: "facing", label: "Facing", kind: "text", placeholder: "East" },
      { name: "plcTag", label: "PLC tag", kind: "text", hint: "e.g. CORNER, PARK_FACING" },
      { name: "parkingSlots", label: "Parking slots", kind: "number" },
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
