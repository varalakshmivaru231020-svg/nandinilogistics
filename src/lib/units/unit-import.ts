/**
 * Planning a unit import: every row checked, nothing written.
 *
 * Pure. The action loads the lookups and hands them in; the same plan drives
 * the preview and the write. The writer (./import-service.ts) re-checks what
 * it can against the database inside the transaction.
 *
 * Rules:
 *  - Project by code, and only a project the importer may access.
 *  - Block by name or code *within that project*; unit type by name or code.
 *    A name two entries share is refused rather than guessed.
 *  - Unit numbers are unique per project: one already there, or one repeated
 *    in the file, is refused (compared without regard to case or spacing).
 *  - Imported units start AVAILABLE. A Status column is accepted only if it
 *    says so — holds and bookings have their own flows.
 */
import {
  matchColumns, numberText, valueOf,
  type ImportColumn, type ImportPlan, type ImportRowOutcome,
} from "@/lib/import/columns";

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

/** Decimal(10,2): the largest area the column can hold. */
const AREA_MAX = 99_999_999.99;
const FLOOR_MAX = 300;

export interface UnitImportLookups {
  /** Every project, so a code the importer cannot access is told apart from a typo. */
  projects: Array<{ id: string; code: string }>;
  /** "all", or the project ids the importer is mapped to. */
  accessibleProjectIds: "all" | ReadonlySet<string>;
  blocks: Array<{ id: string; projectId: string; code: string; name: string; totalFloors: number }>;
  unitTypes: Array<{ id: string; code: string; name: string }>;
  /** Unit numbers already used, keyed by unitKey(projectId, unitNumber). */
  existingUnits: ReadonlySet<string>;
}

export interface UnitImportInput {
  projectId: string;
  blockId: string;
  unitTypeId: string;
  unitNumber: string;
  floorNumber: number;
  carpetArea: number;
  builtUpArea: number;
  superBuiltUpArea: number;
  facing: string | null;
  plcTag: string | null;
  parkingSlots: number;
}

export interface PlannedUnit extends ImportRowOutcome {
  input?: UnitImportInput;
}

export interface UnitImportPlan extends ImportPlan {
  rows: PlannedUnit[];
}

/** The identity a unit number has for uniqueness: its project and its text, ignoring case and spaces. */
export function unitKey(projectId: string, unitNumber: string): string {
  return `${projectId}|${unitNumber.replace(/\s+/g, "").toUpperCase()}`;
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
  const blockById = new Map(lookups.blocks.map((b) => [b.id, b]));
  const canAccess = (id: string) => lookups.accessibleProjectIds === "all" || lookups.accessibleProjectIds.has(id);

  const seen = new Map<string, number>();

  const rows = sheet.rows.map<PlannedUnit>((row, index) => {
    const rowNumber = index + 2;
    const errors: string[] = [];
    const get = (key: string) => valueOf(row, mapping, key);

    // Project
    const projectText = get("project");
    let projectId: string | undefined;
    if (!projectText) errors.push("Project is required");
    else {
      const id = projectByCode.get(projectText.toUpperCase());
      if (!id) errors.push(`Project "${projectText}" is not a project code`);
      else if (!canAccess(id)) errors.push(`Project ${projectText.toUpperCase()} is not mapped to you`);
      else projectId = id;
    }

    // Block, within the project
    const blockText = get("block");
    let blockId: string | undefined;
    if (!blockText) errors.push("Block is required");
    else if (projectId) {
      const id = blockFor(projectId)(blockText);
      if (id === undefined) errors.push(`Block "${blockText}" is not in project ${projectText.toUpperCase()}`);
      else if (id === null) errors.push(`Block "${blockText}" matches more than one block in ${projectText.toUpperCase()}`);
      else blockId = id;
    }

    // Unit type
    const typeText = get("unitType");
    let unitTypeId: string | undefined;
    if (!typeText) errors.push("Unit type is required");
    else {
      const id = unitType(typeText);
      if (id === undefined) errors.push(`Unit type "${typeText}" is not recognised`);
      else if (id === null) errors.push(`Unit type "${typeText}" matches more than one entry`);
      else unitTypeId = id;
    }

    // Unit number
    const unitNumber = get("unitNumber");
    if (!unitNumber) errors.push("Unit number is required");
    else if (unitNumber.length > 40) errors.push("Unit number is longer than 40 characters");
    else if (projectId) {
      const key = unitKey(projectId, unitNumber);
      if (lookups.existingUnits.has(key)) errors.push(`Unit ${unitNumber} already exists in ${projectText.toUpperCase()}`);
      const earlier = seen.get(key);
      if (earlier) errors.push(`Unit ${unitNumber} is repeated from row ${earlier}`);
      else seen.set(key, rowNumber);
    }

    // Numbers
    const whole = (key: string, label: string, opts: { required: boolean; max: number }) => {
      const text = get(key);
      if (!text) {
        if (opts.required) errors.push(`${label} is required`);
        return 0;
      }
      const n = Number(numberText(text));
      if (!/^-?\d+(\.0+)?$/.test(numberText(text)) || !Number.isFinite(n)) {
        errors.push(`${label} "${text}" is not a whole number`);
        return 0;
      }
      if (n < 0) errors.push(`${label} cannot be negative`);
      else if (n > opts.max) errors.push(`${label} ${n} is more than ${opts.max}`);
      return n;
    };
    const area = (key: string, label: string, required: boolean) => {
      const text = get(key);
      if (!text) {
        if (required) errors.push(`${label} is required`);
        return 0;
      }
      const clean = numberText(text);
      if (!/^\d+(\.\d+)?$/.test(clean)) {
        errors.push(`${label} "${text}" is not a number of sq.ft`);
        return 0;
      }
      const n = Math.round(Number(clean) * 100) / 100;
      if (required && n <= 0) errors.push(`${label} must be more than zero`);
      else if (n > AREA_MAX) errors.push(`${label} is too large`);
      return n;
    };

    const floorNumber = whole("floorNumber", "Floor", { required: true, max: FLOOR_MAX });
    const carpetArea = area("carpetArea", "Carpet area", true);
    const builtUpArea = area("builtUpArea", "Built-up area", false);
    const superBuiltUpArea = area("superBuiltUpArea", "Super built-up area", true);
    const parkingSlots = whole("parkingSlots", "Parking slots", { required: false, max: 50 });

    // Areas nest: carpet within built-up within super built-up.
    if (carpetArea > 0 && superBuiltUpArea > 0 && carpetArea > superBuiltUpArea) {
      errors.push("Carpet area is more than super built-up area");
    }
    if (builtUpArea > 0) {
      if (carpetArea > 0 && builtUpArea < carpetArea) errors.push("Built-up area is less than carpet area");
      if (superBuiltUpArea > 0 && builtUpArea > superBuiltUpArea) errors.push("Built-up area is more than super built-up area");
    }

    // A floor the block does not have.
    const block = blockId ? blockById.get(blockId) : undefined;
    if (block && block.totalFloors > 0 && floorNumber > block.totalFloors) {
      errors.push(`Floor ${floorNumber} is above ${block.name}'s ${block.totalFloors} floors`);
    }

    const statusText = get("status");
    if (statusText && !/^available$/i.test(statusText)) {
      errors.push(`Status "${statusText}" — imported units start Available; hold or book them afterwards`);
    }

    const facing = get("facing");
    if (facing.length > 40) errors.push("Facing is longer than 40 characters");
    const plcRaw = get("plcTag");
    const plcTag = plcRaw ? plcRaw.toUpperCase().replace(/[\s-]+/g, "_") : "";
    if (plcTag.length > 40) errors.push("PLC tag is longer than 40 characters");

    return {
      row: rowNumber,
      label: `${projectText || "?"} · ${unitNumber || "(no unit number)"}`,
      errors,
      input: errors.length === 0
        ? {
            projectId: projectId!,
            blockId: blockId!,
            unitTypeId: unitTypeId!,
            unitNumber,
            floorNumber,
            carpetArea,
            builtUpArea,
            superBuiltUpArea,
            facing: facing || null,
            plcTag: plcTag || null,
            parkingSlots,
          }
        : undefined,
    };
  });

  const invalid = rows.filter((r) => r.errors.length > 0).length;
  return { missing, ignored, rows, valid: rows.length - invalid, invalid };
}
