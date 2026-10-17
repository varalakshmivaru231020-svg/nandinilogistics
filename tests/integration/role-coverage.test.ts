import { describe, expect, it } from "vitest";

import { PERMISSIONS } from "@/lib/permissions/registry";
import { prisma } from "./helpers";

/**
 * The roles as the database actually holds them, against what the app needs.
 *
 * The static tests check that the web page, the list route, the record and the
 * form all ask for the same codes. This one asks the other question: given the
 * roles that exist, is anybody left in a gap — able to reach a screen and then
 * refused what that screen opens, or unable to use the app at all.
 *
 * It reads the development database, which is seeded from the same registry
 * production is synced from.
 */
describe("the roles that exist", () => {
  it("lets every role use the app at all", async () => {
    const roles = await prisma.role.findMany({
      include: { permissions: { include: { permission: { select: { code: true } } } } },
    });
    expect(roles.length).toBeGreaterThan(0);
    const without = roles
      .filter((r) => !r.permissions.some((p) => p.permission.code === "admin.mobile.use"))
      .map((r) => r.code);
    // The one permission that exists because the phone exists. A role without
    // it is refused at every endpoint, whatever else it holds.
    expect(without, `these roles cannot sign in to the app: ${without.join(", ")}`).toEqual([]);
  });

  it("grants every permission in the catalogue to somebody", async () => {
    const [catalogue, roles, overrides] = await Promise.all([
      prisma.permission.findMany({ select: { code: true } }),
      prisma.role.findMany({ include: { permissions: { include: { permission: { select: { code: true } } } } } }),
      prisma.userPermission.findMany({ include: { permission: { select: { code: true } } } }),
    ]);
    const granted = new Set<string>([
      ...roles.flatMap((r) => r.permissions.map((p) => p.permission.code)),
      ...overrides.map((o) => o.permission.code),
    ]);
    const orphans = catalogue.map((c) => c.code).filter((c) => !granted.has(c)).sort();
    expect(orphans, `granted to no role and no user: ${orphans.join(", ")}`).toEqual([]);
  });

  it("holds the whole registry, so nothing is unassignable", async () => {
    const catalogue = new Set((await prisma.permission.findMany({ select: { code: true } })).map((c) => c.code));
    const missing = PERMISSIONS.map((p) => p.code).filter((c) => !catalogue.has(c));
    expect(missing, `run \`pnpm perms:sync\`: ${missing.join(", ")}`).toEqual([]);
  });

  /*
   * Two of the phone's lists open a record from another module — a reorder
   * line opens the item, an attendance line opens the employee — because the
   * web's own rows open nothing and a row that cannot be tapped is worse than
   * one that can. That is only true while no role holds the list's permission
   * without the record's.
   */
  it("leaves nobody able to open a list whose rows it may not open", async () => {
    const roles = await prisma.role.findMany({
      include: { permissions: { include: { permission: { select: { code: true } } } } },
    });
    const pairs: Array<[string, string, string]> = [
      ["material/reorder", "material.reorder.view", "material.stock.view"],
      ["hr/attendance", "hr.attendance.view", "hr.employee.view"],
    ];
    for (const [screen, list, record] of pairs) {
      const caught = roles
        .filter((r) => {
          const codes = new Set(r.permissions.map((p) => p.permission.code));
          return codes.has(list) && !codes.has(record);
        })
        .map((r) => r.code);
      expect(caught, `${screen}: ${caught.join(", ")} would be refused the record its own rows open`).toEqual([]);
    }
  });
});
