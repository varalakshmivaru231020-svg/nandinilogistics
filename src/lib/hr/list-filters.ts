import type { Prisma } from "@prisma/client";

/**
 * The Employees list's search and filters as one function, used by the
 * Workforce screen and by the employee export.
 */

type ParamSource = URLSearchParams | Record<string, string | string[] | undefined>;

function read(source: ParamSource, name: string): string {
  const raw = source instanceof URLSearchParams ? source.get(name) : source[name];
  const value = Array.isArray(raw) ? raw[0] : raw;
  return value?.trim() ?? "";
}

/** Record ids are cuids; anything else in the URL is ignored. */
const ID = /^[A-Za-z0-9_-]{1,64}$/;

export interface EmployeeListParams {
  q: string;
  /** Employment type id, or "". */
  type: string;
  /** Designation id, or "". */
  designation: string;
  /** "ACTIVE", "INACTIVE", or "" for everyone. */
  status: EmployeeStatusFilter;
}

export type EmployeeStatusFilter = "" | "ACTIVE" | "INACTIVE";

export function readEmployeeListParams(source: ParamSource): EmployeeListParams {
  const type = read(source, "type");
  const designation = read(source, "designation");
  const status = read(source, "status").toUpperCase();
  return {
    q: read(source, "q"),
    type: ID.test(type) ? type : "",
    designation: ID.test(designation) ? designation : "",
    status: status === "ACTIVE" || status === "INACTIVE" ? status : "",
  };
}

export function employeeListWhere(p: EmployeeListParams): Prisma.EmployeeWhereInput {
  const q = p.q.trim();
  return {
    ...(q
      ? {
          OR: [
            { name: { contains: q, mode: "insensitive" } },
            { employeeCode: { contains: q, mode: "insensitive" } },
            { mobile: { contains: q } },
          ],
        }
      : {}),
    ...(p.type ? { employmentTypeId: p.type } : {}),
    ...(p.designation ? { designationId: p.designation } : {}),
    // Anything that is not explicitly INACTIVE counts as active, so a legacy
    // value never hides someone from both filters at once.
    ...(p.status === "INACTIVE" ? { status: "INACTIVE" } : {}),
    ...(p.status === "ACTIVE" ? { status: { not: "INACTIVE" } } : {}),
  };
}

export function describeEmployeeFilters(
  p: EmployeeListParams,
  names: { type: string | null; designation: string | null },
): string {
  const parts = [
    p.q.trim() ? `Search "${p.q.trim()}"` : null,
    names.type ? `Type ${names.type}` : null,
    names.designation ? `Designation ${names.designation}` : null,
    p.status === "ACTIVE" ? "Active only" : p.status === "INACTIVE" ? "Inactive only" : null,
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : "All employees";
}

/** Masks all but the last four digits, as lead phone numbers are masked. */
export function maskId(value: string | null): string | null {
  if (!value) return null;
  return value.length > 4 ? `${"•".repeat(Math.min(8, value.length - 4))} ${value.slice(-4)}` : "••••";
}
