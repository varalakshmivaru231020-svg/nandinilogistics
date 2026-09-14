/**
 * The rules a unit must satisfy — one module, shared by the spreadsheet import
 * (./unit-import.ts) and the create/edit form (./unit-service.ts), so the two
 * can never disagree about what a valid unit is.
 *
 * Pure and Prisma-free (types only). Everything numeric arrives as text, the
 * way both a sheet cell and a form field hold it.
 *
 *  - checkUnitValues:     unit number, floor, areas (nesting), facing, PLC, parking.
 *  - checkUnitReferences: project accessible, block in that project, unit type
 *                         known, unit number unique in the project.
 *  - validateUnitDraft:   the form's whole unit — ids required, then both of the above.
 *  - unitEditLocks / findLockedChanges: what an edit may still change.
 *  - checkStatusChange:   the only statuses set by hand (AVAILABLE ↔ BLOCKED).
 *  - checkUnitDeletable:  when a unit may be removed.
 */
import type { UnitStatus } from "@prisma/client";

import { numberText } from "@/lib/import/columns";

/** Decimal(10,2): the largest area the column can hold. */
export const AREA_MAX = 99_999_999.99;
export const FLOOR_MAX = 300;
export const PARKING_MAX = 50;
export const TEXT_MAX = 40;
export const REASON_MAX = 500;

export type UnitField =
  | "project" | "block" | "unitType" | "unitNumber" | "floorNumber"
  | "carpetArea" | "builtUpArea" | "superBuiltUpArea"
  | "facing" | "plcTag" | "parkingSlots";

export const UNIT_FIELD_LABELS: Record<UnitField, string> = {
  project: "Project",
  block: "Block",
  unitType: "Unit type",
  unitNumber: "Unit number",
  floorNumber: "Floor",
  carpetArea: "Carpet area",
  builtUpArea: "Built-up area",
  superBuiltUpArea: "Super built-up area",
  facing: "Facing",
  plcTag: "PLC tag",
  parkingSlots: "Parking slots",
};

export interface UnitIssue {
  field: UnitField;
  message: string;
}

/** A unit ready to write. */
export interface UnitInput {
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

export type UnitValues = Omit<UnitInput, "projectId" | "blockId" | "unitTypeId">;

/** The non-reference fields as entered: a sheet's cells or a form's fields. */
export interface UnitValueText {
  unitNumber: string;
  floorNumber: string;
  carpetArea: string;
  builtUpArea: string;
  superBuiltUpArea: string;
  facing: string;
  plcTag: string;
  parkingSlots: string;
}

export interface UnitDraft extends UnitValueText {
  projectId: string;
  blockId: string;
  unitTypeId: string;
}

/** The identity a unit number has for uniqueness: its project and its text, ignoring case and spaces. */
export function unitKey(projectId: string, unitNumber: string): string {
  return `${projectId}|${unitNumber.replace(/\s+/g, "").toUpperCase()}`;
}

/** "park facing" → "PARK_FACING". */
export function normalisePlcTag(text: string): string {
  return text.trim() ? text.trim().toUpperCase().replace(/[\s-]+/g, "_") : "";
}

/* --------------------------------- Values -------------------------------- */

export function checkUnitValues(
  text: UnitValueText,
  block?: { name: string; totalFloors: number },
): { issues: UnitIssue[]; values: UnitValues } {
  const issues: UnitIssue[] = [];
  const push = (field: UnitField, message: string) => issues.push({ field, message });

  const unitNumber = text.unitNumber.trim();
  if (!unitNumber) push("unitNumber", "Unit number is required");
  else if (unitNumber.length > TEXT_MAX) push("unitNumber", `Unit number is longer than ${TEXT_MAX} characters`);

  const whole = (field: UnitField, raw: string, opts: { required: boolean; max: number }) => {
    const label = UNIT_FIELD_LABELS[field];
    const value = raw.trim();
    if (!value) {
      if (opts.required) push(field, `${label} is required`);
      return 0;
    }
    const clean = numberText(value);
    const n = Number(clean);
    if (!/^-?\d+(\.0+)?$/.test(clean) || !Number.isFinite(n)) {
      push(field, `${label} "${value}" is not a whole number`);
      return 0;
    }
    if (n < 0) push(field, `${label} cannot be negative`);
    else if (n > opts.max) push(field, `${label} ${n} is more than ${opts.max}`);
    return n;
  };
  const area = (field: UnitField, raw: string, required: boolean) => {
    const label = UNIT_FIELD_LABELS[field];
    const value = raw.trim();
    if (!value) {
      if (required) push(field, `${label} is required`);
      return 0;
    }
    const clean = numberText(value);
    if (!/^\d+(\.\d+)?$/.test(clean)) {
      push(field, `${label} "${value}" is not a number of sq.ft`);
      return 0;
    }
    const n = Math.round(Number(clean) * 100) / 100;
    if (required && n <= 0) push(field, `${label} must be more than zero`);
    else if (n > AREA_MAX) push(field, `${label} is too large`);
    return n;
  };

  const floorNumber = whole("floorNumber", text.floorNumber, { required: true, max: FLOOR_MAX });
  const carpetArea = area("carpetArea", text.carpetArea, true);
  const builtUpArea = area("builtUpArea", text.builtUpArea, false);
  const superBuiltUpArea = area("superBuiltUpArea", text.superBuiltUpArea, true);
  const parkingSlots = whole("parkingSlots", text.parkingSlots, { required: false, max: PARKING_MAX });

  // Areas nest: carpet within built-up within super built-up.
  if (carpetArea > 0 && superBuiltUpArea > 0 && carpetArea > superBuiltUpArea) {
    push("carpetArea", "Carpet area is more than super built-up area");
  }
  if (builtUpArea > 0) {
    if (carpetArea > 0 && builtUpArea < carpetArea) push("builtUpArea", "Built-up area is less than carpet area");
    if (superBuiltUpArea > 0 && builtUpArea > superBuiltUpArea) push("builtUpArea", "Built-up area is more than super built-up area");
  }

  // A floor the block does not have.
  if (block && block.totalFloors > 0 && floorNumber > block.totalFloors) {
    push("floorNumber", `Floor ${floorNumber} is above ${block.name}'s ${block.totalFloors} floors`);
  }

  const facing = text.facing.trim();
  if (facing.length > TEXT_MAX) push("facing", `Facing is longer than ${TEXT_MAX} characters`);
  const plcTag = normalisePlcTag(text.plcTag);
  if (plcTag.length > TEXT_MAX) push("plcTag", `PLC tag is longer than ${TEXT_MAX} characters`);

  return {
    issues,
    values: {
      unitNumber, floorNumber, carpetArea, builtUpArea, superBuiltUpArea,
      facing: facing || null, plcTag: plcTag || null, parkingSlots,
    },
  };
}

/* ------------------------------- References ------------------------------ */

export interface UnitLookups {
  /** Every project the check may meet, so a code the user cannot access is told apart from a typo. */
  projects: Array<{ id: string; code: string }>;
  /** "all", or the project ids the user is mapped to. */
  accessibleProjectIds: "all" | ReadonlySet<string>;
  blocks: Array<{ id: string; projectId: string; code: string; name: string; totalFloors: number }>;
  unitTypes: Array<{ id: string; code: string; name: string }>;
  /** Unit numbers already used, keyed by unitKey(projectId, unitNumber). An edited unit's own number is left out. */
  existingUnits: ReadonlySet<string>;
}

export interface UnitLookupIndex {
  lookups: UnitLookups;
  projectById: Map<string, { id: string; code: string }>;
  blockById: Map<string, UnitLookups["blocks"][number]>;
  unitTypeById: Map<string, UnitLookups["unitTypes"][number]>;
  canAccess: (projectId: string) => boolean;
}

/** Built once per check (or once per file), so a thousand-row import stays linear. */
export function indexUnitLookups(lookups: UnitLookups): UnitLookupIndex {
  return {
    lookups,
    projectById: new Map(lookups.projects.map((p) => [p.id, p])),
    blockById: new Map(lookups.blocks.map((b) => [b.id, b])),
    unitTypeById: new Map(lookups.unitTypes.map((t) => [t.id, t])),
    canAccess: (id) => lookups.accessibleProjectIds === "all" || lookups.accessibleProjectIds.has(id),
  };
}

/**
 * Checks the references a unit makes. An id left undefined is skipped — the
 * caller has already reported why it has none.
 */
export function checkUnitReferences(
  ref: { projectId?: string; blockId?: string; unitTypeId?: string; unitNumber: string },
  index: UnitLookupIndex,
): UnitIssue[] {
  const issues: UnitIssue[] = [];
  const project = ref.projectId ? index.projectById.get(ref.projectId) : undefined;

  if (ref.projectId) {
    if (!project) issues.push({ field: "project", message: "Project not found" });
    else if (!index.canAccess(project.id)) issues.push({ field: "project", message: `Project ${project.code} is not mapped to you` });
  }

  if (ref.blockId) {
    const block = index.blockById.get(ref.blockId);
    if (!block) issues.push({ field: "block", message: "That block is not available" });
    else if (ref.projectId && block.projectId !== ref.projectId) {
      issues.push({ field: "block", message: `Block ${block.name} is not in project ${project?.code ?? "chosen"}` });
    }
  }

  if (ref.unitTypeId && !index.unitTypeById.has(ref.unitTypeId)) {
    issues.push({ field: "unitType", message: "That unit type is not available" });
  }

  const unitNumber = ref.unitNumber.trim();
  if (ref.projectId && unitNumber && index.lookups.existingUnits.has(unitKey(ref.projectId, unitNumber))) {
    issues.push({ field: "unitNumber", message: `Unit ${unitNumber} already exists in ${project?.code ?? "this project"}` });
  }

  return issues;
}

/** The form's unit: project, block and unit type chosen by id, then every rule the import applies. */
export function validateUnitDraft(
  draft: UnitDraft,
  index: UnitLookupIndex,
): { issues: UnitIssue[]; input?: UnitInput } {
  const issues: UnitIssue[] = [];
  const projectId = draft.projectId.trim();
  const blockId = draft.blockId.trim();
  const unitTypeId = draft.unitTypeId.trim();

  if (!projectId) issues.push({ field: "project", message: "Project is required" });
  if (!blockId) issues.push({ field: "block", message: "Block is required" });
  if (!unitTypeId) issues.push({ field: "unitType", message: "Unit type is required" });

  issues.push(...checkUnitReferences({ projectId, blockId, unitTypeId, unitNumber: draft.unitNumber }, index));

  const block = index.blockById.get(blockId);
  const { issues: valueIssues, values } = checkUnitValues(
    draft,
    block && block.projectId === projectId ? block : undefined,
  );
  issues.push(...valueIssues);

  return {
    issues,
    input: issues.length === 0 ? { projectId, blockId, unitTypeId, ...values } : undefined,
  };
}

/* ---------------------------------- Edits --------------------------------- */

/** What a unit has been through. Any of these makes its identity fixed. */
export interface UnitUsage {
  status: UnitStatus;
  holds: number;
  bookings: number;
  costSheets: number;
}

/**
 * Fields that price a unit or that an agreement names. Once a hold, cost sheet
 * or booking has seen the unit, changing any of them would make those records
 * describe a different flat. Floor is included: floor rise is priced off it.
 */
export const IDENTITY_FIELDS: readonly UnitField[] = [
  "block", "unitNumber", "unitType", "floorNumber", "carpetArea", "builtUpArea", "superBuiltUpArea",
];

/** Always editable: descriptive attributes. */
export const FREE_FIELDS: readonly UnitField[] = ["facing", "plcTag", "parkingSlots"];

const SALES_STATUSES: readonly UnitStatus[] = ["HELD", "BOOKED", "AGREEMENT", "REGISTERED"];

const plural = (n: number, one: string, many: string) => `${n === 1 ? "a" : n} ${n === 1 ? one : many}`;

export interface UnitEditLocks {
  locked: ReadonlySet<UnitField>;
  /** One line per locked field, for the form. */
  reasons: Partial<Record<UnitField, string>>;
  /** Why the identity is locked, or null when it is not. */
  identityReason: string | null;
}

export function unitEditLocks(usage: UnitUsage): UnitEditLocks {
  const locked = new Set<UnitField>(["project"]);
  const reasons: Partial<Record<UnitField, string>> = {
    project: "A unit cannot move to another project — delete it and create it there instead.",
  };

  const used = [
    usage.holds > 0 ? plural(usage.holds, "hold", "holds") : null,
    usage.costSheets > 0 ? plural(usage.costSheets, "cost sheet", "cost sheets") : null,
    usage.bookings > 0 ? plural(usage.bookings, "booking", "bookings") : null,
  ].filter(Boolean) as string[];

  let identityReason: string | null = null;
  if (used.length > 0) {
    identityReason = `Locked — this unit has ${used.join(", ")}, which pricing and agreements depend on.`;
  } else if (SALES_STATUSES.includes(usage.status)) {
    identityReason = `Locked — this unit is ${usage.status.toLowerCase()}.`;
  }
  if (identityReason) {
    for (const f of IDENTITY_FIELDS) {
      locked.add(f);
      reasons[f] = identityReason;
    }
  }
  return { locked, reasons, identityReason };
}

const FIELD_VALUE: Record<UnitField, (u: UnitInput) => unknown> = {
  project: (u) => u.projectId,
  block: (u) => u.blockId,
  unitType: (u) => u.unitTypeId,
  unitNumber: (u) => u.unitNumber,
  floorNumber: (u) => u.floorNumber,
  carpetArea: (u) => u.carpetArea,
  builtUpArea: (u) => u.builtUpArea,
  superBuiltUpArea: (u) => u.superBuiltUpArea,
  facing: (u) => u.facing,
  plcTag: (u) => u.plcTag,
  parkingSlots: (u) => u.parkingSlots,
};

/** The fields an edit changes. */
export function changedFields(before: UnitInput, after: UnitInput): UnitField[] {
  return (Object.keys(FIELD_VALUE) as UnitField[]).filter((f) => FIELD_VALUE[f](before) !== FIELD_VALUE[f](after));
}

/** A refusal for every locked field the edit changes. */
export function findLockedChanges(before: UnitInput, after: UnitInput, locks: UnitEditLocks): UnitIssue[] {
  return changedFields(before, after)
    .filter((f) => locks.locked.has(f))
    .map((f) => ({ field: f, message: `${UNIT_FIELD_LABELS[f]} cannot change: ${locks.reasons[f] ?? "it is locked."}` }));
}

/* --------------------------------- Status --------------------------------- */

/** The only statuses a person sets by hand. Everything else belongs to holds and bookings. */
export const MANUAL_STATUSES: readonly UnitStatus[] = ["AVAILABLE", "BLOCKED"];

export const isManualStatus = (s: UnitStatus) => MANUAL_STATUSES.includes(s);

/** Refusal text for a hand status change, or null when it is allowed. */
export function checkStatusChange(from: UnitStatus, to: UnitStatus, reason: string): string | null {
  if (!isManualStatus(from)) {
    return `The unit is ${from.toLowerCase()}. That status is cleared by its hold or booking, not by hand.`;
  }
  if (!isManualStatus(to)) {
    return `${to.charAt(0)}${to.slice(1).toLowerCase()} is set by holds, bookings and agreements — it cannot be set by hand.`;
  }
  if (from === to) return `The unit is already ${to.toLowerCase()}.`;
  if (to === "BLOCKED" && !reason.trim()) return "Give a reason for blocking the unit.";
  if (reason.trim().length > REASON_MAX) return `Keep the reason under ${REASON_MAX} characters.`;
  return null;
}

/* --------------------------------- Delete --------------------------------- */

export interface UnitDeleteState {
  unitNumber: string;
  status: UnitStatus;
  holds: number;
  bookings: number;
  costSheets: number;
  priceItems: number;
}

export const UNIT_IN_USE_MESSAGE =
  "This unit has sales records (holds, cost sheets, bookings or price-list rates) and cannot be deleted. Block it instead to take it off sale.";

/** Refusal text naming what stands in the way, or null when the unit may be deleted. */
export function checkUnitDeletable(u: UnitDeleteState): string | null {
  const records = [
    u.holds > 0 ? plural(u.holds, "hold", "holds") : null,
    u.costSheets > 0 ? plural(u.costSheets, "cost sheet", "cost sheets") : null,
    u.bookings > 0 ? plural(u.bookings, "booking", "bookings") : null,
    u.priceItems > 0 ? plural(u.priceItems, "price-list rate", "price-list rates") : null,
  ].filter(Boolean);
  const blockers = [
    !isManualStatus(u.status) ? `it is ${u.status.toLowerCase()}` : null,
    records.length > 0 ? `it has ${records.join(", ")}` : null,
  ].filter(Boolean);
  if (blockers.length === 0) return null;
  return `Unit ${u.unitNumber} cannot be deleted: ${blockers.join("; ")}. Block it instead to take it off sale.`;
}
