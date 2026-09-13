/**
 * Planning a masters import: every row checked, nothing written.
 *
 * Pure — no Prisma, no server-only — so it is tested directly, and so the
 * preview the user approves and the rows that are then written come from the
 * same function. A row goes through buildSchema and toPrismaData, exactly the
 * path the create form takes; an import can never store something the form
 * would have refused.
 */
import {
  matchColumns, numberText, truthy, valueOf,
  type ImportColumn, type ImportPlan, type ImportRowOutcome,
} from "@/lib/import/columns";

import { buildSchema, recordLabel, toPrismaData } from "./schema";
import type { MasterDef } from "./types";

type Options = Record<string, Array<{ value: string; label: string }>>;

export interface SheetRows {
  headers: string[];
  rows: Array<Record<string, string>>;
}

export function masterImportColumns(def: MasterDef): ImportColumn[] {
  return [
    ...def.fields.map<ImportColumn>((f) => ({
      key: f.name,
      label: f.label,
      required: f.required,
      // A select stored as cityId is written in a sheet as "City" (the label)
      // or "city" — never as an id.
      aliases: f.type === "select" && f.name.endsWith("Id") ? [f.name.slice(0, -2)] : [],
      hint:
        f.type === "select" ? `Name as shown in the ${f.label.toLowerCase()} list`
          : f.type === "checkbox" ? "Yes or No"
          : f.type === "number" || f.type === "decimal" ? "A number"
          : f.hint,
    })),
    { key: "status", label: "Status", hint: "Active or Inactive — Active when blank" },
  ];
}

export interface PlannedMasterRow extends ImportRowOutcome {
  data?: Record<string, unknown>;
}

export interface MasterImportPlan extends ImportPlan {
  rows: PlannedMasterRow[];
}

/**
 * @param options       the select options, as loadOptions returns them
 * @param existingCodes codes already in the table, upper-cased
 */
export function planMasterImport(
  def: MasterDef,
  sheet: SheetRows,
  options: Options,
  existingCodes: ReadonlySet<string>,
): MasterImportPlan {
  const columns = masterImportColumns(def);
  const { mapping, missing, ignored } = matchColumns(sheet.headers, columns);
  if (missing.length > 0) return { missing, ignored, rows: [], valid: 0, invalid: 0 };

  const schema = buildSchema(def);
  const hasCode = def.fields.some((f) => f.name === "code");
  const seenCodes = new Map<string, number>();

  // Option labels, case-insensitive. A label that two options share cannot be
  // resolved by name, and is reported rather than guessed.
  const lookup = new Map<string, Map<string, string | null>>();
  for (const [field, list] of Object.entries(options)) {
    const byLabel = new Map<string, string | null>();
    for (const o of list) {
      const k = o.label.trim().toLowerCase();
      byLabel.set(k, byLabel.has(k) ? null : o.value);
    }
    lookup.set(field, byLabel);
  }

  const rows = sheet.rows.map<PlannedMasterRow>((row, index) => {
    const rowNumber = index + 2;
    const errors: string[] = [];
    const raw: Record<string, unknown> = {};

    for (const f of def.fields) {
      const text = valueOf(row, mapping, f.name);

      if (f.type === "select") {
        if (!text) { raw[f.name] = ""; continue; }
        const byLabel = lookup.get(f.name);
        const known = options[f.name]?.some((o) => o.value === text);
        if (known) { raw[f.name] = text; continue; }
        const id = byLabel?.get(text.toLowerCase());
        if (id === undefined) errors.push(`${f.label} "${text}" is not in the ${f.label.toLowerCase()} list`);
        else if (id === null) errors.push(`${f.label} "${text}" matches more than one entry`);
        raw[f.name] = id ?? "";
        continue;
      }
      if (f.type === "checkbox") { raw[f.name] = truthy(text); continue; }
      if (f.type === "number" || f.type === "decimal") { raw[f.name] = text ? numberText(text) : undefined; continue; }
      raw[f.name] = text;
    }

    const parsed = schema.safeParse(raw);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        if (!errors.includes(issue.message)) errors.push(issue.message);
      }
    }

    const data = parsed.success ? toPrismaData(def, parsed.data as Record<string, unknown>) : undefined;

    const statusText = valueOf(row, mapping, "status");
    if (statusText && !/^(active|inactive)$/i.test(statusText)) {
      errors.push(`Status "${statusText}" should be Active or Inactive`);
    } else if (data) {
      data.status = /^inactive$/i.test(statusText) ? "INACTIVE" : "ACTIVE";
    }

    if (hasCode) {
      const code = String(raw.code ?? "").trim().toUpperCase();
      if (code) {
        if (existingCodes.has(code)) errors.push(`Code ${code} already exists`);
        const earlier = seenCodes.get(code);
        if (earlier) errors.push(`Code ${code} is repeated from row ${earlier}`);
        else seenCodes.set(code, rowNumber);
      }
    }

    const labelSource = data ?? (raw as Record<string, unknown>);
    return {
      row: rowNumber,
      label: recordLabel(def, { ...labelSource, id: `row ${rowNumber}` }),
      errors,
      data: errors.length === 0 ? data : undefined,
    };
  });

  const invalid = rows.filter((r) => r.errors.length > 0).length;
  return { missing, ignored, rows, valid: rows.length - invalid, invalid };
}
