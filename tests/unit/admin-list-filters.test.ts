import { $Enums } from "@prisma/client";
import { describe, expect, it } from "vitest";

import {
  AUDIT_ACTIONS, auditListWhere, auditQuery, describeAuditFilters, describeUserFilters,
  readAuditListParams, readRoleListParams, readUserListParams, roleListWhere,
  USER_EXPORT_SELECT, USER_STATUSES, userListWhere,
} from "@/lib/admin/list-filters";

describe("user list filters", () => {
  it("applies nothing when no filter is set", () => {
    expect(userListWhere(readUserListParams(new URLSearchParams()))).toEqual({});
  });

  it("searches name, email and employee code, trimmed and case-insensitive", () => {
    const where = userListWhere(readUserListParams(new URLSearchParams("q=%20ravi%20")));
    expect(where.OR).toEqual([
      { name: { contains: "ravi", mode: "insensitive" } },
      { email: { contains: "ravi", mode: "insensitive" } },
      { employeeCode: { contains: "ravi", mode: "insensitive" } },
    ]);
  });

  it("filters by status and by role held", () => {
    const where = userListWhere(readUserListParams({ status: "SUSPENDED", role: "clrole123" }));
    expect(where.status).toBe("SUSPENDED");
    expect(where.roles).toEqual({ some: { roleId: "clrole123" } });
  });

  it("ignores a status that is not a UserStatus and a malformed role id", () => {
    const p = readUserListParams(new URLSearchParams("status=DELETED&role=' OR 1=1"));
    expect(p).toEqual({ q: "", status: "", role: "" });
    expect(userListWhere(p)).toEqual({});
  });

  it("offers exactly the UserStatus enum", () => {
    expect([...USER_STATUSES].sort()).toEqual(Object.values($Enums.UserStatus).sort());
  });

  it("never selects a secret for the export", () => {
    const keys = Object.keys(USER_EXPORT_SELECT);
    for (const secret of ["passwordHash", "sessions", "mustChangePassword", "permissions"]) {
      expect(keys).not.toContain(secret);
    }
    // Every top-level read is on the allow-list; nothing is included wholesale.
    expect(keys.sort()).toEqual([
      // The id is read so a row on a phone can open the record it stands for.
      // It is not a column, so no file carries it.
      "createdAt", "department", "designation", "email", "employeeCode",
      "id", "isSuperAdmin", "lastLoginAt", "name", "phone", "roles", "status",
    ]);
    expect(JSON.stringify(USER_EXPORT_SELECT)).not.toMatch(/password|token|hash/i);
  });

  it("describes the filters in words", () => {
    expect(describeUserFilters(readUserListParams({}), null)).toBe("All users");
    expect(describeUserFilters(readUserListParams({ q: "ravi", status: "ACTIVE" }), "Admin"))
      .toBe('Search "ravi" · Status active · Role Admin');
  });
});

describe("role list filters", () => {
  it("searches name, code and description, and filters status", () => {
    const where = roleListWhere(readRoleListParams({ q: "site", status: "INACTIVE" }));
    expect(where.OR).toHaveLength(3);
    expect(where.status).toBe("INACTIVE");
  });

  it("ignores an unknown status", () => {
    expect(roleListWhere(readRoleListParams({ status: "ARCHIVED" }))).toEqual({});
  });
});

describe("audit list filters", () => {
  it("filters summary, action, entity", () => {
    const where = auditListWhere(readAuditListParams({ q: "PO", action: "APPROVE", entity: "PurchaseOrder" }));
    expect(where).toEqual({
      summary: { contains: "PO", mode: "insensitive" },
      action: "APPROVE",
      entity: "PurchaseOrder",
    });
  });

  it("ignores an unknown action, and the 'all' entity", () => {
    expect(auditListWhere(readAuditListParams({ action: "HACK", entity: "all" }))).toEqual({});
  });

  it("covers the whole last day of the range", () => {
    const where = auditListWhere(readAuditListParams({ from: "2026-09-01", to: "2026-09-13" }));
    expect(where.createdAt).toEqual({
      gte: new Date("2026-09-01T00:00:00.000Z"),
      lt: new Date("2026-09-14T00:00:00.000Z"),
    });
  });

  it("drops a malformed date and turns a backwards range round", () => {
    expect(auditListWhere(readAuditListParams({ from: "2026-02-31" }))).toEqual({});
    expect(auditListWhere(readAuditListParams({ from: "2026-09-13", to: "2026-09-01" })).createdAt).toEqual({
      gte: new Date("2026-09-01T00:00:00.000Z"),
      lt: new Date("2026-09-14T00:00:00.000Z"),
    });
  });

  it("keeps every filter in pagination links", () => {
    const p = readAuditListParams(new URLSearchParams("q=x&action=DELETE&entity=Item&from=2026-09-01&to=2026-09-02&page=3"));
    expect(auditQuery(p).toString()).toBe("q=x&action=DELETE&entity=Item&from=2026-09-01&to=2026-09-02");
    expect(describeAuditFilters(p)).toBe('Search "x" · Action DELETE · Entity Item · 2026-09-01 to 2026-09-02');
  });

  it("offers exactly the AuditAction enum", () => {
    expect([...AUDIT_ACTIONS].sort()).toEqual(Object.values($Enums.AuditAction).sort());
  });
});
