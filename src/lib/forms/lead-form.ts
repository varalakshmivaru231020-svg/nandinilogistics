import "server-only";

import { prisma } from "@/lib/db";
import { PERM } from "@/lib/permissions/codes";
import type { AuthContext } from "@/lib/rbac/context";
import { loadOptions } from "@/lib/screens/resolve";

import type { FormFieldDef, ResolvedField } from "./types";

/**
 * The capture-lead form, which is whatever Masters → Lead Settings says it is.
 *
 * The web drawer says so on its own face — "Form is built from Masters → Lead
 * Settings" — and it reads the rows of `LeadFormField` in their sort order, so
 * a field added or renamed or made mandatory in the master changes the form.
 *
 * So the rows are read here, and mapped the way the drawer maps them: a system
 * field posts under the name the lead schema knows, a custom one posts under
 * `custom:<id>`, and the placeholder for each kind is the design's own.
 *
 * Who the lead is assigned to is the SOW's rule, not the master's: somebody
 * holding `sales.lead.assign` (Admin, a Team Leader) is asked for the
 * tele-caller and must answer; a tele-caller keeps the lead; a rider's lead
 * is handed round-robin, so the field is not drawn for them.
 */

/** What the design puts in an empty box, by the kind of thing it asks for. */
const PLACEHOLDER: Record<string, string> = {
  PHONE: "98765 43210 (without country code)",
  NUMBER: "e.g. 25",
  DATE: "dd-mm-yyyy",
};

const placeholderFor = (type: string) => PLACEHOLDER[type] ?? "Type here";

/** A custom field's kind, as the drawer picks its input type. */
function customKind(type: string): FormFieldDef["kind"] {
  switch (type) {
    case "NUMBER":
      return "number";
    case "DATE":
      return "date";
    case "EMAIL":
      return "email";
    case "PHONE":
      return "phone";
    case "DESCRIPTION":
      return "textarea";
    case "CHECKBOX":
      return "checkbox";
    default:
      return "text";
  }
}

export async function leadFormFields(ctx: AuthContext): Promise<ResolvedField[]> {
  const canAssign = ctx.has(PERM.sales.lead.assign);
  const [rows, companies, teleCallers] = await Promise.all([
    prisma.leadFormField.findMany({ orderBy: { sortOrder: "asc" } }),
    loadOptions("companies", ctx),
    canAssign ? loadOptions("teleCallers", ctx) : Promise.resolve([]),
  ]);

  const fields: ResolvedField[] = [];

  for (const f of rows) {
    const base = { label: f.label, required: f.required };

    if (!f.isSystem) {
      fields.push({
        ...base,
        name: `custom:${f.id}`,
        kind: customKind(f.type),
        placeholder: f.type === "CHECKBOX" ? undefined : placeholderFor(f.type),
        wide: f.type === "DESCRIPTION",
      });
      continue;
    }

    switch (f.fieldKey) {
      case "name":
        fields.push({ ...base, name: "name", kind: "text", placeholder: "Type here" });
        break;
      case "phone":
        fields.push({ ...base, name: "phone", kind: "phone", placeholder: placeholderFor("PHONE") });
        break;
      case "altPhone":
        fields.push({ ...base, name: "altPhone", kind: "phone", placeholder: placeholderFor("PHONE") });
        break;
      case "email":
        fields.push({ ...base, name: "email", kind: "email", placeholder: "Type here" });
        break;
      case "location":
        fields.push({ ...base, name: "location", kind: "text", placeholder: "Area or hub" });
        break;
      case "companyIds":
        fields.push({
          ...base,
          name: "companyIds",
          kind: "multi",
          options: companies,
          placeholder: "Search companies…",
          wide: true,
        });
        break;
      case "ownerId":
        if (!canAssign) break;
        fields.push({
          ...base,
          name: "ownerId",
          kind: "lookup",
          required: true,
          options: teleCallers,
          placeholder: "Search tele-callers…",
          hint: "Assignment is mandatory when you create a lead.",
        });
        break;
      case "requirement":
        fields.push({
          ...base,
          name: "requirement",
          kind: "textarea",
          placeholder: "Type here…",
          wide: true,
        });
        break;
      case "nextActionAt":
        fields.push({ ...base, name: "nextActionAt", kind: "date", placeholder: placeholderFor("DATE") });
        break;
      // A system field the drawer draws nothing for is drawn nothing here.
      default:
        break;
    }
  }

  return fields;
}

/**
 * The attendance sheet: one line per active person, pre-filled with whatever
 * is already marked for the day.
 *
 * This cannot be written down either — the lines are the workforce. The web
 * marks a whole table at once and saves it in one call, and so does this: the
 * action takes the marks as an array, and a line left on its current state is
 * sent unchanged.
 */
export async function attendanceSheetFields(ctx: AuthContext): Promise<ResolvedField[]> {
  void ctx;
  const today = new Date().toISOString().slice(0, 10);

  const [employees, marks] = await Promise.all([
    prisma.employee.findMany({
      where: { status: "ACTIVE" },
      orderBy: { name: "asc" },
      select: {
        id: true, name: true, employeeCode: true,
        employmentType: { select: { name: true } },
      },
    }),
    prisma.attendanceEntry.findMany({
      where: { attendanceOn: new Date(today) },
      select: { employeeId: true, status: true, overtimeHours: true },
    }),
  ]);

  const already = new Map(marks.map((m) => [m.employeeId, m]));

  return [
    { name: "attendanceOn", label: "Date", kind: "date", required: true, initial: today },
    {
      name: "marks",
      label: "The sheet",
      kind: "rows",
      // The workforce, so a line cannot be added or dropped from a phone.
      fixedRows: true,
      wide: true,
      initialRows: employees.map((e) => {
        const mark = already.get(e.id);
        return {
          _label: `${e.name} · ${e.employeeCode} · ${e.employmentType.name}`,
          employeeId: e.id,
          status: mark?.status ?? "PRESENT",
          overtimeHours: mark ? Number(mark.overtimeHours) : 0,
        };
      }),
      row: [
        { name: "employeeId", label: "Person", kind: "text", hidden: true },
        {
          name: "status",
          label: "Attendance",
          kind: "select",
          required: true,
          // The web's own three marks, in its own order and words.
          options: [
            { value: "PRESENT", label: "Present" },
            { value: "ABSENT", label: "Absent" },
            { value: "HALF_DAY", label: "Half day" },
          ],
        },
        { name: "overtimeHours", label: "Overtime hours", kind: "number" },
      ],
    },
  ];
}
