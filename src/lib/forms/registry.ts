import "server-only";

import { PERM } from "@/lib/permissions/codes";
import type { AuthContext } from "@/lib/rbac/context";

import { COUNTRY_CODES } from "./dial-codes";
import type { FormDef, FormFieldDef, FormRef } from "./types";

/**
 * The forms, in the web's own words.
 *
 * Copied field by field from the modal or page each one mirrors — the label,
 * the placeholder, the hint, the `name` the action reads and the order they
 * appear in. Nothing here is invented.
 *
 * A form is served only to somebody holding its `permission`, and submitting
 * it calls the same server action the web calls, which authorizes again. This
 * registry decides what is *drawn*; it does not grant anything.
 */

const PEOPLE_SEARCH = "Search people…";

// src/app/(app)/tasks/new/new-task-form.tsx
const TASK_FIELDS: ReadonlyArray<FormFieldDef> = [
  {
    name: "title",
    label: "Title",
    kind: "text",
    required: true,
    placeholder: "Collect pending KYC from Peeko riders",
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
    name: "assigneeIds",
    label: "Assign to",
    note: "one or more Team Leaders",
    kind: "multi",
    required: true,
    source: "teamLeaders",
    placeholder: PEOPLE_SEARCH,
    wide: true,
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
  { name: "files", label: "Attachments", kind: "files", wide: true },
];

/*
 * src/app/(app)/hr/hr-screen.tsx → the person drawer, which is one form for
 * both the new record and the edit.
 *
 * The photograph and the two identity copies are part of it: `saveFiles()`
 * reads `photo` and `doc:<kind>` out of the same body as the particulars.
 */
const EMPLOYEE_FIELDS: ReadonlyArray<FormFieldDef> = [
  {
    name: "photo",
    label: "Photo",
    kind: "files",
    // The web's own square: one image, and a new one replaces it.
    accept: "image/*",
    maxFiles: 1,
  },
  {
    name: "employmentTypeId",
    label: "Type of employment",
    kind: "select",
    required: true,
    source: "employmentTypes",
  },
  { name: "name", label: "Name", kind: "text", required: true, placeholder: "Full name" },
  { name: "designationId", label: "Designation", kind: "select", source: "designations" },
  {
    name: "mobileCode",
    label: "Country code",
    kind: "select",
    initial: "+91 India",
    options: COUNTRY_CODES.map((c) => ({ value: c, label: c })),
    // The web joins the code to the number and posts one value.
    prefixes: "mobile",
  },
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
  { name: "temporaryStreet", label: "Temporary street", kind: "text", placeholder: "House, street, area" },
  { name: "temporaryCity", label: "Temporary city", kind: "text", placeholder: "City" },
  { name: "temporaryState", label: "Temporary state", kind: "text", placeholder: "State" },
  { name: "temporaryPinCode", label: "Temporary PIN code", kind: "text", placeholder: "600001" },
  { name: "permanentStreet", label: "Permanent street", kind: "text", placeholder: "House, street, area" },
  { name: "permanentCity", label: "Permanent city", kind: "text", placeholder: "City" },
  { name: "permanentState", label: "Permanent state", kind: "text", placeholder: "State" },
  { name: "permanentPinCode", label: "Permanent PIN code", kind: "text", placeholder: "600001" },
  {
    name: "address",
    label: "Address",
    kind: "textarea",
    placeholder: "House, area, city",
    wide: true,
  },
  { name: "joinedOn", label: "Joining date", kind: "date" },
  { name: "drivingLicence", label: "Driving licence", kind: "text", placeholder: "KA01 20230001234", caps: true },
  { name: "pfNumber", label: "PF number", kind: "text", placeholder: "Optional" },
  { name: "insuranceNumber", label: "Insurance number", kind: "text", placeholder: "Shown on the ID card" },
  { name: "monthlySalary", label: "Monthly salary (₹)", kind: "money", placeholder: "e.g. 18000" },
  {
    name: "referredById",
    label: "Referred by",
    kind: "text",
    placeholder: "e.g. NL004 or REF-NL004",
    hint: "Optional — search a rider by name or Rider ID, or type their referral code",
  },
  { name: "emergencyMobileFamily", label: "Father / mother mobile", kind: "phone", placeholder: "98765 43210" },
  { name: "emergencyMobileFriend", label: "Friend mobile", kind: "phone", placeholder: "98765 43210" },
  { name: "bankAccountNo", label: "Account number", kind: "text", placeholder: "Account number" },
  { name: "bankHolderName", label: "Account holder name", kind: "text", placeholder: "As on the passbook" },
  { name: "bankIfsc", label: "IFSC code", kind: "text", placeholder: "HDFC0001234", caps: true },
  { name: "bankName", label: "Bank name", kind: "text", placeholder: "Bank" },
  { name: "companyIds", label: "Companies deployed to", kind: "multi", source: "companies", wide: true },
  {
    name: "doc:Aadhaar front",
    label: "Aadhaar front",
    kind: "files",
    accept: "application/pdf,image/*",
    maxFiles: 1,
    note: "Aadhaar front and back are mandatory for riders · PAN, passbook and driving licence optional",
  },
  {
    name: "doc:Aadhaar back",
    label: "Aadhaar back",
    kind: "files",
    accept: "application/pdf,image/*",
    maxFiles: 1,
  },
  {
    name: "doc:PAN card",
    label: "PAN card",
    kind: "files",
    accept: "application/pdf,image/*",
    maxFiles: 1,
  },
  {
    name: "doc:Passbook",
    label: "Passbook",
    kind: "files",
    accept: "application/pdf,image/*",
    maxFiles: 1,
  },
  {
    name: "doc:Driving licence",
    label: "Driving licence",
    kind: "files",
    accept: "application/pdf,image/*",
    maxFiles: 1,
  },
];

export const FORMS: Record<string, FormDef> = {
  /* ---------------------------------------------------------------- tasks */

  "tasks:create": {
    key: "tasks:create",
    module: "tasks",
    title: "New task",
    description: "Assigned to one or more Team Leaders, who move it to In progress and Done.",
    submitLabel: "Assign task",
    permission: PERM.task.task.create,
    action: "tasks/createTask",
    shape: { kind: "formData" },
    done: "Task raised.",
    fields: TASK_FIELDS,
  },

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
    fields: TASK_FIELDS.filter((f) => f.name !== "files"),
  },

  /* ---------------------------------------------------------------- leads */

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
      { name: "phone", label: "Mobile number", kind: "phone", required: true },
      { name: "altPhone", label: "Alternate number", kind: "phone" },
      { name: "email", label: "Email", kind: "email" },
      { name: "location", label: "Location", kind: "text", placeholder: "Area or hub" },
      {
        name: "companyIds",
        label: "Companies",
        kind: "multi",
        source: "companies",
        wide: true,
      },
      {
        name: "requirement",
        label: "Notes",
        kind: "textarea",
        placeholder: "Has own bike, prefers evening shift",
        wide: true,
      },
      { name: "nextActionAt", label: "Next follow-up on", kind: "date" },
      // The stale guard the action compares against, carried not drawn.
      { name: "updatedAt", label: "Unchanged since", kind: "text", hidden: true },
    ],
  },

  // The same action for a rider referring somebody: name, mobile and where.
  // The lead is handed to a tele-caller round-robin by the assignment rule.
  // src/app/(app)/sales/leads/leads-screen.tsx → CaptureLead, whose labels are
  // the Lead Settings master's.
  "sales/leads:refer": {
    key: "sales/leads:refer",
    module: "sales/leads",
    title: "Refer a rider",
    description: "A tele-caller will call them.",
    submitLabel: "Save lead",
    permission: PERM.sales.lead.create,
    hiddenFrom: PERM.sales.lead.assign,
    action: "sales/leads/createLead",
    shape: { kind: "formData" },
    done: "Lead captured.",
    fields: [
      { name: "name", label: "Name", kind: "text", required: true, placeholder: "Type here" },
      { name: "phone", label: "Mobile number", kind: "phone", required: true, placeholder: "98765 43210 (without country code)" },
      { name: "location", label: "Location", kind: "text", placeholder: "Area or hub" },
    ],
  },

  /* --------------------------------------------------------------- advances */

  // src/app/(app)/advances/advances-screen.tsx → the request modal. A rider
  // asks for themselves: the action takes their own record when no rider is sent.
  "advances:create": {
    key: "advances:create",
    module: "advances",
    title: "New advance request",
    submitLabel: "Submit request",
    permission: PERM.advance.advance.create,
    action: "advances/createAdvance",
    shape: { kind: "formData" },
    done: "Advance requested.",
    fields: [
      { name: "amount", label: "Amount (₹)", kind: "money", required: true },
      {
        name: "priority",
        label: "Priority",
        kind: "select",
        required: true,
        initial: "LOW",
        options: [
          { value: "EMERGENCY", label: "Emergency" },
          { value: "LOW", label: "Low priority" },
        ],
      },
      { name: "reasonId", label: "Reason", kind: "select", source: "advanceReasons", emptyLabel: "Select…" },
      { name: "remarks", label: "Remarks", kind: "textarea", wide: true },
    ],
  },

  /* ------------------------------------------------------------- profile */

  // src/app/(app)/hr/edit-requests/profile-edit-form.tsx. Opened on the
  // caller's own rider record (id = their employee id) and prefilled from it.
  "hr/profile:edit": {
    key: "hr/profile:edit",
    module: "hr/profile",
    title: "Request a profile change",
    submitLabel: "Request change",
    permission: PERM.hr.employee.requestEdit,
    action: "hr/requestProfileEdit",
    shape: { kind: "formData" },
    done: "Change requested.",
    onRecord: true,
    edits: true,
    fields: [
      { name: "mobile", label: "Mobile number", kind: "phone", placeholder: "98765 43210" },
      { name: "altContact", label: "Alternate number", kind: "phone", placeholder: "98765 43210" },
      { name: "emergencyMobileFamily", label: "Father / mother mobile", kind: "phone", placeholder: "98765 43210" },
      { name: "emergencyMobileFriend", label: "Friend mobile", kind: "phone", placeholder: "98765 43210" },
      { name: "address", label: "Address", kind: "textarea", placeholder: "House, area, city", wide: true },
      { name: "bankAccountNo", label: "Account number", kind: "text", placeholder: "Account number" },
      { name: "bankHolderName", label: "Account holder name", kind: "text", placeholder: "As on the passbook" },
      { name: "bankIfsc", label: "IFSC code", kind: "text", placeholder: "HDFC0001234", caps: true },
      { name: "bankName", label: "Bank name", kind: "text", placeholder: "Bank" },
      { name: "insuranceNumber", label: "Insurance number", kind: "text", placeholder: "Shown on the ID card" },
      { name: "reason", label: "Reason for the change", kind: "textarea", placeholder: "New number, bank changed…", wide: true },
    ],
  },

  /* ------------------------------------------------------------- attendance */

  // src/app/(app)/hr/hr-screen.tsx → MarkTab. One line per active person,
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

  /* ----------------------------------------------------------------- people */

  "hr/employees:create": {
    key: "hr/employees:create",
    module: "hr/employees",
    title: "New employee",
    // The drawer's own description.
    description: "Name, mobile, photo and Aadhaar are mandatory",
    submitLabel: "Create employee",
    permission: PERM.hr.employee.create,
    action: "hr/createEmployee",
    shape: { kind: "formData" },
    done: "Employee added.",
    fields: EMPLOYEE_FIELDS,
  },

  "hr/employees:edit": {
    key: "hr/employees:edit",
    module: "hr/employees",
    title: "Edit employee",
    description: "Name, mobile, photo and Aadhaar are mandatory",
    submitLabel: "Save changes",
    permission: PERM.hr.employee.update,
    action: "hr/updateEmployee",
    shape: { kind: "positional", order: ["$id", "$values"] },
    done: "Employee changed.",
    onRecord: true,
    edits: true,
    fields: EMPLOYEE_FIELDS,
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
    .filter((f) => !f.onRecord && ctx.has(f.permission) && !(f.hiddenFrom && ctx.has(f.hiddenFrom)))
    .map((f) => ({ key: f.key, title: f.title, submitLabel: f.submitLabel }));
}
