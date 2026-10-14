import "server-only";

import { prisma } from "@/lib/db";
import type { AuthContext } from "@/lib/rbac/context";
import { loadOptions } from "@/lib/screens/resolve";

import type { FormFieldDef, ResolvedField } from "./types";

/**
 * The capture-lead form, which is whatever Masters → Lead Settings says it is.
 *
 * This one cannot be written down. The web drawer says so on its own face —
 * "Form is built from Masters → Lead Settings" — and it reads the rows of
 * `LeadFormField` in their sort order, so a field added or renamed or made
 * mandatory in the master changes the form. A copy of it in a registry would
 * be a different form the day anybody edited the master.
 *
 * So the rows are read here, and mapped the way the drawer maps them: a system
 * field posts under the name the lead schema knows, a custom one posts under
 * `custom:<id>`, and the placeholder for each kind is the design's own.
 */

/** What the design puts in an empty box, by the kind of thing it asks for. */
const PLACEHOLDER: Record<string, string> = {
  PHONE: "98765 43210 (without country code)",
  NUMBER: "e.g. 85,00,000",
  DATE: "dd-mm-yyyy",
};

const placeholderFor = (type: string) => PLACEHOLDER[type] ?? "Type here";

/** What the drawer's dropdowns call the nothing-chosen option. */
const EMPTY = "Select…";

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
  const [rows, sources, projects, unitTypes] = await Promise.all([
    prisma.leadFormField.findMany({ orderBy: { sortOrder: "asc" } }),
    loadOptions("leadSources", ctx),
    loadOptions("projects", ctx),
    loadOptions("unitTypes", ctx),
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
        fields.push({
          ...base,
          name: "phone",
          kind: "phone",
          placeholder: placeholderFor("PHONE"),
        });
        break;
      case "email":
        fields.push({ ...base, name: "email", kind: "email", placeholder: "Type here" });
        break;
      case "sourceId":
        fields.push({ ...base, name: "sourceId", kind: "select", options: sources, emptyLabel: EMPTY });
        break;
      case "projectId":
        fields.push({ ...base, name: "projectId", kind: "select", options: projects, emptyLabel: EMPTY });
        break;
      case "unitTypeId":
        fields.push({ ...base, name: "unitTypeId", kind: "select", options: unitTypes, emptyLabel: EMPTY });
        break;
      case "budgetMax":
        fields.push({
          ...base,
          name: "budgetMax",
          kind: "money",
          placeholder: placeholderFor("NUMBER"),
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
      case "siteVisitPlanned":
        fields.push({ ...base, name: "siteVisitPlanned", kind: "checkbox", wide: true });
        break;
      // A system field the drawer draws nothing for is drawn nothing here.
      default:
        break;
    }
  }

  return fields;
}
