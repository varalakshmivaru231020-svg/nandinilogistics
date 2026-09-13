/**
 * Planning a lead import: every row checked, nothing written.
 *
 * Pure. The action loads the lookups and hands them in; the same plan drives
 * the preview and the write, and each row passes LeadSchema — the New Lead
 * form's own rules.
 */
import {
  dayText, matchColumns, numberText, valueOf,
  type ImportColumn, type ImportPlan, type ImportRowOutcome,
} from "@/lib/import/columns";

import { LeadSchema, phoneKey, type LeadInput } from "./lead-schema";

export const LEAD_IMPORT_COLUMNS: ImportColumn[] = [
  { key: "name", label: "Name", required: true, aliases: ["Lead name", "Customer name", "Full name"] },
  { key: "phone", label: "Phone", required: true, aliases: ["Mobile", "Mobile number", "Phone number", "Contact number"] },
  { key: "altPhone", label: "Alternate phone", aliases: ["Alt phone", "Phone 2", "Other phone"] },
  { key: "email", label: "Email", aliases: ["Email address", "Email id"] },
  { key: "source", label: "Lead source", required: true, aliases: ["Source"], hint: "Name as in the lead source list" },
  { key: "project", label: "Project", aliases: ["Project of interest"], hint: "Project code or name" },
  { key: "unitType", label: "Interested in", aliases: ["Unit type", "Configuration"], hint: "Unit type name, e.g. 2 BHK" },
  { key: "budgetMin", label: "Budget from", aliases: ["Budget min", "Min budget"], hint: "Rupees" },
  { key: "budgetMax", label: "Budget to", aliases: ["Budget max", "Max budget", "Budget"], hint: "Rupees" },
  { key: "requirement", label: "Requirement", aliases: ["Remarks", "Notes", "Comments"] },
  { key: "nextActionAt", label: "Next action on", aliases: ["Follow-up date", "Next follow-up"], hint: "A date, e.g. 05/04/2026" },
  { key: "owner", label: "Owner", aliases: ["Assigned to"], hint: "Email or employee code — only if you may assign leads" },
];

export interface LeadImportLookups {
  sources: Array<{ id: string; name: string }>;
  projects: Array<{ id: string; code: string; name: string }>;
  unitTypes: Array<{ id: string; name: string }>;
  owners: Array<{ id: string; email: string; employeeCode: string; name: string }>;
  /** Leads already captured, by phoneKey — the earliest for each number. */
  existingPhones: ReadonlyMap<string, { id: string; name: string }>;
  /** Whether the importer may choose owners. Without it the assignment rule decides. */
  canAssign: boolean;
}

export interface PlannedLead extends ImportRowOutcome {
  input?: LeadInput & {
    unitTypeId: string | null;
    /** Chosen in the sheet; null leaves it to the organisation's assignment rule. */
    ownerId: string | null;
    duplicateOfId: string | null;
  };
}

export interface LeadImportPlan extends ImportPlan {
  rows: PlannedLead[];
}

/** Case-insensitive lookup that refuses to guess between two entries with the same name. */
function resolver<T>(items: T[], keys: (item: T) => string[], id: (item: T) => string) {
  const map = new Map<string, string | null>();
  for (const item of items) {
    for (const k of keys(item)) {
      const norm = k.trim().toLowerCase();
      if (!norm) continue;
      const prior = map.get(norm);
      map.set(norm, prior !== undefined && prior !== id(item) ? null : id(item));
    }
  }
  return (text: string) => map.get(text.trim().toLowerCase());
}

export function planLeadImport(
  sheet: { headers: string[]; rows: Array<Record<string, string>> },
  lookups: LeadImportLookups,
): LeadImportPlan {
  const { mapping, missing, ignored } = matchColumns(sheet.headers, LEAD_IMPORT_COLUMNS);
  if (missing.length > 0) return { missing, ignored, rows: [], valid: 0, invalid: 0 };

  const source = resolver(lookups.sources, (s) => [s.name], (s) => s.id);
  const project = resolver(lookups.projects, (p) => [p.code, p.name], (p) => p.id);
  const unitType = resolver(lookups.unitTypes, (u) => [u.name], (u) => u.id);
  const owner = resolver(lookups.owners, (o) => [o.email, o.employeeCode], (o) => o.id);

  const seenPhones = new Map<string, number>();

  const rows = sheet.rows.map<PlannedLead>((row, index) => {
    const rowNumber = index + 2;
    const errors: string[] = [];
    const notes: string[] = [];
    const get = (key: string) => valueOf(row, mapping, key);

    const lookup = (key: string, label: string, find: (t: string) => string | null | undefined) => {
      const text = get(key);
      if (!text) return undefined;
      const id = find(text);
      if (id === undefined) errors.push(`${label} "${text}" is not recognised`);
      else if (id === null) errors.push(`${label} "${text}" matches more than one entry`);
      return id ?? undefined;
    };

    const sourceId = lookup("source", "Lead source", source);
    const projectId = lookup("project", "Project", project);
    const unitTypeId = lookup("unitType", "Interested in", unitType);

    let ownerId: string | null = null;
    if (get("owner")) {
      if (!lookups.canAssign) errors.push("You may not choose owners — leave Owner blank and the assignment rule will decide");
      else ownerId = lookup("owner", "Owner", owner) ?? null;
    }

    const nextText = get("nextActionAt");
    const nextActionAt = nextText ? dayText(nextText) : "";
    if (nextText && !/^\d{4}-\d{2}-\d{2}$/.test(nextActionAt)) {
      errors.push(`Next action on "${nextText}" is not a date`);
    }

    const budget = (key: string) => {
      const text = get(key);
      return text ? numberText(text) : undefined;
    };

    const parsed = LeadSchema.safeParse({
      name: get("name"),
      phone: get("phone"),
      altPhone: get("altPhone") || undefined,
      email: get("email"),
      sourceId: sourceId ?? (get("source") ? "unresolved" : ""),
      projectId,
      requirement: get("requirement") || undefined,
      budgetMin: budget("budgetMin"),
      budgetMax: budget("budgetMax"),
      nextActionAt: nextActionAt || undefined,
    });
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const message = issue.path[0] === "budgetMin" || issue.path[0] === "budgetMax"
          ? `${issue.path[0] === "budgetMin" ? "Budget from" : "Budget to"} must be a number of rupees`
          : issue.message;
        if (!errors.includes(message)) errors.push(message);
      }
    }

    const v = parsed.success ? parsed.data : undefined;
    if (v?.budgetMin !== undefined && v.budgetMax !== undefined && v.budgetMin > v.budgetMax) {
      errors.push("Budget from is more than budget to");
    }

    // Duplicates are flagged, never refused — the same as capturing by hand.
    let duplicateOfId: string | null = null;
    const key = phoneKey(get("phone"));
    if (key.length >= 8) {
      const existing = lookups.existingPhones.get(key);
      if (existing) {
        duplicateOfId = existing.id;
        notes.push(`possible duplicate of ${existing.name}`);
      }
      const earlier = seenPhones.get(key);
      if (earlier) notes.push(`same phone as row ${earlier}`);
      else seenPhones.set(key, rowNumber);
    }

    const name = get("name") || "(no name)";
    return {
      row: rowNumber,
      label: `${name} · ${get("phone") || "no phone"}`,
      errors,
      notes,
      input: errors.length === 0 && v
        ? { ...v, sourceId: sourceId!, unitTypeId: unitTypeId ?? null, ownerId, duplicateOfId }
        : undefined,
    };
  });

  const invalid = rows.filter((r) => r.errors.length > 0).length;
  return { missing, ignored, rows, valid: rows.length - invalid, invalid };
}
