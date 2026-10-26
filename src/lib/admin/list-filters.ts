import type { AuditAction, Prisma, RecordStatus, UserStatus } from "@prisma/client";

import { dateCondition, parseReportFilters, type ReportFilters } from "@/lib/reports/filters";

/**
 * Users, Roles and Audit Trail — search and filters as pure functions shared
 * by each Administration screen and its export.
 */

type ParamSource = URLSearchParams | Record<string, string | string[] | undefined>;

function read(source: ParamSource, name: string): string {
  const raw = source instanceof URLSearchParams ? source.get(name) : source[name];
  const value = Array.isArray(raw) ? raw[0] : raw;
  return value?.trim() ?? "";
}

function oneOf<T extends string>(value: string, allowed: readonly T[]): T | "" {
  return (allowed as readonly string[]).includes(value) ? (value as T) : "";
}

const ID = /^[A-Za-z0-9_-]{1,64}$/;

/* ---------------------------------- Users ---------------------------------- */

export const USER_STATUSES = ["ACTIVE", "INACTIVE", "SUSPENDED"] as const satisfies readonly UserStatus[];

export const USER_STATUS_LABEL: Record<UserStatus, string> = {
  ACTIVE: "Active", INACTIVE: "Inactive", SUSPENDED: "Suspended",
};

export interface UserListParams {
  q: string;
  status: UserStatus | "";
  /** Role id, or "". */
  role: string;
}

export function readUserListParams(source: ParamSource): UserListParams {
  const role = read(source, "role");
  return {
    q: read(source, "q"),
    status: oneOf(read(source, "status"), USER_STATUSES),
    role: ID.test(role) ? role : "",
  };
}

export function userListWhere(p: UserListParams): Prisma.UserWhereInput {
  const q = p.q.trim();
  return {
    ...(q
      ? {
          OR: [
            { name: { contains: q, mode: "insensitive" } },
            { email: { contains: q, mode: "insensitive" } },
            { employeeCode: { contains: q, mode: "insensitive" } },
          ],
        }
      : {}),
    ...(p.status ? { status: p.status } : {}),
    ...(p.role ? { roles: { some: { roleId: p.role } } } : {}),
  };
}

/**
 * What the user export reads — an explicit allow-list, so a secret column
 * added to User later (a hash, a token, an MFA seed) never reaches a file.
 */
export const USER_EXPORT_SELECT = {
  // Carried so a list row can open the record it stands for.
  id: true,
  employeeCode: true,
  name: true,
  email: true,
  phone: true,
  status: true,
  isSuperAdmin: true,
  lastLoginAt: true,
  createdAt: true,
  department: { select: { name: true } },
  designation: { select: { name: true } },
  roles: { select: { role: { select: { name: true } } } },
} as const satisfies Prisma.UserSelect;

export function describeUserFilters(p: UserListParams, roleName: string | null): string {
  const parts = [
    p.q.trim() ? `Search "${p.q.trim()}"` : null,
    p.status ? `Status ${USER_STATUS_LABEL[p.status].toLowerCase()}` : null,
    roleName ? `Role ${roleName}` : null,
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : "All users";
}

/* ---------------------------------- Roles ---------------------------------- */

export const ROLE_STATUSES = ["ACTIVE", "INACTIVE"] as const satisfies readonly RecordStatus[];

export interface RoleListParams {
  q: string;
  status: RecordStatus | "";
}

export function readRoleListParams(source: ParamSource): RoleListParams {
  return { q: read(source, "q"), status: oneOf(read(source, "status"), ROLE_STATUSES) };
}

export function roleListWhere(p: RoleListParams): Prisma.RoleWhereInput {
  const q = p.q.trim();
  return {
    ...(q
      ? {
          OR: [
            { name: { contains: q, mode: "insensitive" } },
            { code: { contains: q, mode: "insensitive" } },
            { description: { contains: q, mode: "insensitive" } },
          ],
        }
      : {}),
    ...(p.status ? { status: p.status } : {}),
  };
}

export function describeRoleFilters(p: RoleListParams): string {
  const parts = [
    p.q.trim() ? `Search "${p.q.trim()}"` : null,
    p.status === "ACTIVE" ? "Active only" : p.status === "INACTIVE" ? "Inactive only" : null,
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : "All roles";
}

/* ---------------------------------- Audit ---------------------------------- */

export const AUDIT_ACTIONS = [
  "CREATE", "UPDATE", "DELETE", "APPROVE", "REJECT", "SUBMIT",
  "CANCEL", "LOGIN", "LOGOUT", "LOGIN_FAILED", "EXPORT", "VIEW", "ASSIGN",
] as const satisfies readonly AuditAction[];

/** Entity names are logical model names ("Item", "PurchaseOrder"). */
const ENTITY = /^[A-Za-z0-9_ .-]{1,64}$/;

export interface AuditListParams {
  q: string;
  action: AuditAction | "";
  entity: string;
  /** Inclusive yyyy-mm-dd range on when the entry was written. */
  range: ReportFilters;
}

export function readAuditListParams(source: ParamSource): AuditListParams {
  const entity = read(source, "entity");
  return {
    q: read(source, "q"),
    action: oneOf(read(source, "action"), AUDIT_ACTIONS),
    entity: entity !== "all" && ENTITY.test(entity) ? entity : "",
    range: parseReportFilters(source, { company: false, date: "When" }),
  };
}

export function auditListWhere(p: AuditListParams): Prisma.AuditLogWhereInput {
  const q = p.q.trim();
  const createdAt = dateCondition(p.range);
  return {
    ...(q ? { summary: { contains: q, mode: "insensitive" } } : {}),
    ...(p.action ? { action: p.action } : {}),
    ...(p.entity ? { entity: p.entity } : {}),
    ...(createdAt ? { createdAt } : {}),
  };
}

/** The filters as query parameters — for pagination links that keep them. */
export function auditQuery(p: AuditListParams): URLSearchParams {
  const sp = new URLSearchParams();
  if (p.q.trim()) sp.set("q", p.q.trim());
  if (p.action) sp.set("action", p.action);
  if (p.entity) sp.set("entity", p.entity);
  if (p.range.from) sp.set("from", p.range.from);
  if (p.range.to) sp.set("to", p.range.to);
  return sp;
}

export function describeAuditFilters(p: AuditListParams): string {
  const parts = [
    p.q.trim() ? `Search "${p.q.trim()}"` : null,
    p.action ? `Action ${p.action}` : null,
    p.entity ? `Entity ${p.entity}` : null,
    p.range.from && p.range.to
      ? `${p.range.from} to ${p.range.to}`
      : p.range.from ? `From ${p.range.from}` : p.range.to ? `Up to ${p.range.to}` : null,
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : "All entries";
}
