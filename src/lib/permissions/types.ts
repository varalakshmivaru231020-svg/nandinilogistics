/**
 * Permission catalogue types.
 *
 * Every guarded surface in the platform — a page, a tab, a list, a button, a
 * sensitive field, a report — is represented by exactly one PermissionDef.
 * The registry in ./registry.ts is the single source of truth; the database
 * `permissions` table is a projection of it, synced by `pnpm perms:sync`.
 */

/** What the permission guards. Drives grouping and iconography in the matrix UI. */
export type PermissionKind =
  /** A routable screen. Absence hides the menu entry and blocks the route. */
  | "PAGE"
  /** A tab inside a detail screen. */
  | "TAB"
  /** A non-visual capability (approve, submit, recalculate). */
  | "ACTION"
  /** A visible control in a toolbar or row. */
  | "BUTTON"
  /** A sensitive column or field (rates, margins, contact numbers). */
  | "FIELD"
  /** A report and its export. */
  | "REPORT";

export interface PermissionDef {
  /** module.resource.action — globally unique. */
  code: string;
  module: string;
  resource: string;
  action: string;
  label: string;
  description?: string;
  /** Section heading in the role-permission matrix. */
  group: string;
  kind: PermissionKind;
}

export interface ModuleDef {
  key: string;
  label: string;
  /** Ordering in the matrix UI and the sidebar. */
  sortOrder: number;
  /** Pending client verification — permissions are registered but the UI is not built. */
}
