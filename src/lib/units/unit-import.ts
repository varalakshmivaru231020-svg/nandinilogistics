/**
 * Planning a unit import: every row checked, nothing written.
 *
 * Pure. The action loads the lookups and hands them in; the same plan drives
 * the preview and the write. The writer (./import-service.ts) re-checks what
 * it can against the database inside the transaction.
 *
 * Rules (the value and reference rules live in ./unit-rules.ts, shared with
 * the unit form, so a unit valid on screen is valid in a sheet and back):
 *  - Project by code, and only a project the importer may access.
 *  - Block by name or code *within that project*; unit type by name or code.
 *    A name two entries share is refused rather than guessed.
 *  - Unit numbers are unique per project: one already there, or one repeated
 *    in the file, is refused (compared without regard to case or spacing).
 *  - Imported units start AVAILABLE. A Status column is accepted only if it
 *    says so — holds and bookings have their own flows.
 */
import {
  matchColumns, valueOf,
  type ImportColumn, type ImportPlan, type ImportRowOutcome,
} from "@/lib/import/columns";
import {
  checkUnitReferences, checkUnitValues, indexUnitLookups, unitKey,
  type UnitInput, type UnitLookups,
} from "./unit-rules";

export { unitKey } from "./unit-rules";

export const UNIT_IMPORT_COLUMNS: ImportColumn[] = [
  { key: "project", label: "Project", required: true, aliases: ["Project code"], hint: "Project code, e.g. NNS" },
  { key: "block", label: "Block", required: true, aliases: ["Tower", "Block name", "Cluster"], hint: "Block name or code within that project" },
  { key: "unitNumber", label: "Unit number", required: true, aliases: ["Unit", "Unit no", "Flat no", "Flat number"] },
  { key: "unitType", label: "Unit type", required: true, aliases: ["Type", "Configuration"], hint: "Name or code, e.g. 2 BHK" },
  { key: "floorNumber", label: "Floor", required: true, aliases: ["Floor number", "Floor no"], hint: "A whole number; 0 for ground" },
  { key: "carpetArea", label: "Carpet area", required: true, aliases: ["Carpet", "Carpet area sq ft", "Carpet (sq.ft)"], hint: "sq.ft" },
  { key: "builtUpArea", label: "Built-up area", aliases: ["Built up", "Builtup area"], hint: "sq.ft" },
  { key: "superBuiltUpArea", label: "Super built-up area", required: true, aliases: ["Super built-up", "SBA", "Saleable area"], hint: "sq.ft — the area rates apply to" },
  { key: "facing", label: "Facing", hint: "e.g. East" },
  { key: "plcTag", label: "PLC tag", aliases: ["PLC"], hint: "e.g. CORNER, PARK_FACING" },
  { key: "parkingSlots", label: "Parking slots", aliases: ["Parking"], hint: "A whole number" },
  { key: "status", label: "Status", hint: "Leave blank — imported units start Available" },
];

export type UnitImportLookups = UnitLookups;

export type UnitImportInput = UnitInput;

export interface PlannedUnit extends ImportRowOutcome {
  input?: UnitImportInput;
}

export interface UnitImportPlan extends ImportPlan {
  rows: PlannedUnit[];
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

export function planUnitImport(
  sheet: { headers: string[]; rows: Array<Record<string, string>> },
  lookups: UnitImportLookups,
): UnitImportPlan {
  const { mapping, missing, ignored } = matchColumns(sheet.headers, UNIT_IMPORT_COLUMNS);
  if (missing.length > 0) return { missing, ignored, rows: [], valid: 0, invalid: 0 };

  const index = indexUnitLookups(lookups);
  const projectByCode = new Map(lookups.projects.map((p) => [p.code.trim().toUpperCase(), p.id]));
  const unitType = resolver(lookups.unitTypes, (u) => [u.name, u.code], (u) => u.id);
  const blocksByProject = new Map<string, typeof lookups.blocks>();
  for (const b of lookups.blocks) {
    blocksByProject.set(b.projectId, [...(blocksByProject.get(b.projectId) ?? []), b]);
  }
  const blockResolvers = new Map<string, (text: string) => string | null | undefined>();
  const blockFor = (projectId: string) => {
    let r = blockResolvers.get(projectId);
    if (!r) {
      r = resolver(blocksByProject.get(projectId) ?? [], (b) => [b.name, b.code], (b) => b.id);
      blockResolvers.set(projectId, r);
    }
    return r;
  };

  const seen = new Map<string, number>();

  const rows = sheet.rows.map<PlannedUnit>((row, index_) => {
    const rowNumber = index_ + 2;
    const errors: string[] = [];
    const get = (key: string) => valueOf(row, mapping, key);

    // Project, by code
    const projectText = get("project");
    let projectId: string | undefined;
    if (!projectText) errors.push("Project is required");
    else {
      const id = projectByCode.get(projectText.toUpperCase());
      if (!id) errors.push(`Project "${projectText}" is not a project code`);
      else if (!index.canAccess(id)) errors.push(`Project ${projectText.toUpperCase()} is not mapped to you`);
      else projectId = id;
    }

    // Block, by name or code within the project
    const blockText = get("block");
    let blockId: string | undefined;
    if (!blockText) errors.push("Block is required");
    else if (projectId) {
      const id = blockFor(projectId)(blockText);
      if (id === undefined) errors.push(`Block "${blockText}" is not in project ${projectText.toUpperCase()}`);
      else if (id === null) errors.push(`Block "${blockText}" matches more than one block in ${projectText.toUpperCase()}`);
      else blockId = id;
    }

    // Unit type, by name or code
    const typeText = get("unitType");
    let unitTypeId: string | undefined;
    if (!typeText) errors.push("Unit type is required");
    else {
      const id = unitType(typeText);
      if (id === undefined) errors.push(`Unit type "${typeText}" is not recognised`);
      else if (id === null) errors.push(`Unit type "${typeText}" matches more than one entry`);
      else unitTypeId = id;
    }

    // The shared rules: references (incl. unit number already in the project) and values.
    const unitNumber = get("unitNumber");
    errors.push(...checkUnitReferences({ projectId, blockId, unitTypeId, unitNumber }, index).map((i) => i.message));

    // Repeated within this file — a sheet-only rule.
    if (projectId && unitNumber) {
      const key = unitKey(projectId, unitNumber);
      const earlier = seen.get(key);
      if (earlier) errors.push(`Unit ${unitNumber} is repeated from row ${earlier}`);
      else seen.set(key, rowNumber);
    }

    const { issues, values } = checkUnitValues(
      {
        unitNumber,
        floorNumber: get("floorNumber"),
        carpetArea: get("carpetArea"),
        builtUpArea: get("builtUpArea"),
        superBuiltUpArea: get("superBuiltUpArea"),
        facing: get("facing"),
        plcTag: get("plcTag"),
        parkingSlots: get("parkingSlots"),
      },
      blockId ? index.blockById.get(blockId) : undefined,
    );
    errors.push(...issues.map((i) => i.message));

    const statusText = get("status");
    if (statusText && !/^available$/i.test(statusText)) {
      errors.push(`Status "${statusText}" — imported units start Available; hold or book them afterwards`);
    }

    return {
      row: rowNumber,
      label: `${projectText || "?"} · ${unitNumber || "(no unit number)"}`,
      errors,
      input: errors.length === 0
        ? { projectId: projectId!, blockId: blockId!, unitTypeId: unitTypeId!, ...values }
        : undefined,
    };
  });

  const invalid = rows.filter((r) => r.errors.length > 0).length;
  return { missing, ignored, rows, valid: rows.length - invalid, invalid };
}
