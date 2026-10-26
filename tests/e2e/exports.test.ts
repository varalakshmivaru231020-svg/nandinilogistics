import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { prisma } from "../integration/helpers";
import { BASE_URL, revokeTestSessions, sessionFor, serverIsUp } from "./session";

/** This file's own session tag, so a parallel file cannot revoke its cookies. */
const LABEL = "exports";

/**
 * Every export route, over HTTP, against the permissions the database actually
 * grants. Nothing here hard-codes who may export what: for each seeded role the
 * expected answer is worked out from that user's roles and overrides, so the
 * test follows the role matrix and fails only when a route disagrees with it.
 *
 * Requires the app running (`pnpm start`), like the rest of the E2E suite.
 */

const up = await serverIsUp();
const suite = up ? describe : describe.skip;

const ROLES: Record<string, string> = {
  admin: "admin@nandini.example",
  tl: "tl@nandini.example",
  telecaller: "telecaller@nandini.example",
  rider: "rider@nandini.example",
};

/** [export URL, view permission, export permission] */
const ROUTES: Array<[string, string, string]> = [
  ["/api/masters/companies/export", "masters.company.view", "masters.company.export"],
  ["/api/sales/leads/export", "sales.lead.view", "sales.lead.export"],
  ["/api/sales/follow-ups/export", "sales.followUp.view", "sales.followUp.export"],
  ["/api/hr/employees/export", "hr.employee.view", "hr.employee.export"],
  ["/api/hr/attendance/export", "hr.attendance.view", "hr.attendance.export"],
  ["/api/tasks/export", "task.task.view", "task.task.export"],
  ["/api/admin/users/export", "admin.user.view", "admin.user.export"],
  ["/api/admin/roles/export", "admin.role.view", "admin.role.export"],
  ["/api/admin/audit/export", "admin.audit.view", "admin.audit.export"],
];

const tokens: Record<string, string> = {};
const holdings: Record<string, { superAdmin: boolean; codes: Set<string> }> = {};

/** A seeded user's permissions: role grants, plus ALLOW overrides, minus DENY overrides. */
async function permissionsOf(email: string) {
  const user = await prisma.user.findUniqueOrThrow({
    where: { email },
    select: {
      isSuperAdmin: true,
      roles: { select: { role: { select: { status: true, permissions: { select: { permission: { select: { code: true } } } } } } } },
      permissions: { select: { effect: true, permission: { select: { code: true } } } },
    },
  });
  const codes = new Set<string>();
  for (const ur of user.roles) {
    if (ur.role.status !== "ACTIVE") continue;
    for (const rp of ur.role.permissions) codes.add(rp.permission.code);
  }
  for (const up of user.permissions) if (up.effect === "ALLOW") codes.add(up.permission.code);
  for (const up of user.permissions) if (up.effect === "DENY") codes.delete(up.permission.code);
  return { superAdmin: user.isSuperAdmin, codes };
}

async function download(path: string, token?: string) {
  const res = await fetch(`${BASE_URL}${path}`, {
    redirect: "manual",
    headers: token ? { cookie: `nn_session=${token}` } : {},
  });
  const bytes = new Uint8Array(await res.arrayBuffer());
  return { status: res.status, type: res.headers.get("content-type") ?? "", disposition: res.headers.get("content-disposition") ?? "", bytes };
}

suite("exports, end to end", () => {
  beforeAll(async () => {
    for (const [role, email] of Object.entries(ROLES)) {
      tokens[role] = await sessionFor(email, LABEL);
      holdings[role] = await permissionsOf(email);
    }
  });

  afterAll(async () => {
    await revokeTestSessions(LABEL);
    await prisma.$disconnect();
  });

  for (const [route, view, exportCode] of ROUTES) {
    describe(route, () => {
      it("asks a signed-out visitor to sign in", async () => {
        expect((await download(`${route}?format=csv`)).status).toBe(401);
      });

      for (const role of Object.keys(ROLES)) {
        it(`answers ${role} as the role matrix says`, async () => {
          const h = holdings[role];
          const allowed = h.superAdmin || (h.codes.has(view) && h.codes.has(exportCode));
          const res = await download(`${route}?format=csv`, tokens[role]);

          if (allowed) {
            expect(res.status, `${role} holds ${view} + ${exportCode}`).toBe(200);
            expect(res.disposition).toMatch(/^attachment; filename=".+\.csv"$/);
            // UTF-8 byte-order mark: every CSV export starts with one.
            expect([...res.bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
          } else {
            expect(res.status, `${role} lacks ${h.codes.has(view) ? exportCode : view}`).toBe(403);
            expect(res.bytes.length).toBeLessThan(200);
          }
        });
      }
    });
  }

  describe("formats", () => {
    it("serves Excel and PDF with their real signatures", async () => {
      const xlsx = await download("/api/sales/leads/export?format=xlsx", tokens.admin);
      expect(xlsx.status).toBe(200);
      expect([...xlsx.bytes.slice(0, 4)]).toEqual([0x50, 0x4b, 0x03, 0x04]); // zip

      const pdf = await download("/api/hr/employees/export?format=pdf", tokens.admin);
      expect(pdf.status).toBe(200);
      expect(new TextDecoder().decode(pdf.bytes.slice(0, 5))).toBe("%PDF-");
    });

    it("refuses a format it does not know", async () => {
      expect((await download("/api/sales/leads/export?format=docx", tokens.admin)).status).toBe(400);
    });
  });

  describe("scope travels with the export", () => {
    it("gives a tele-caller only their own leads", async () => {
      const res = await download("/api/sales/leads/export?format=json", tokens.telecaller);
      if (res.status !== 200) return; // the matrix may withhold the export
      const own = await prisma.lead.count({ where: { owner: { email: ROLES.telecaller } } });
      const json = JSON.parse(new TextDecoder().decode(res.bytes)) as { data?: { total?: number } };
      expect(json.data?.total ?? 0).toBeLessThanOrEqual(own);
    });
  });
});
