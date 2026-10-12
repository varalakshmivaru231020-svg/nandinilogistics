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

const ROLES = ["owner", "pm", "supervisor", "store", "sales", "saleshead"] as const;

/** [export URL, view permission, export permission] */
const ROUTES: Array<[string, string, string]> = [
  ["/api/reports/bookingRegister/export", "reports.bookingRegister.view", "reports.bookingRegister.export"],
  ["/api/reports/stockValuation/export", "reports.stockValuation.view", "reports.stockValuation.export"],
  ["/api/masters/items/export", "masters.item.view", "masters.item.export"],
  ["/api/sales/leads/export", "sales.lead.view", "sales.lead.export"],
  ["/api/sales/customers/export", "sales.customer.view", "sales.customer.export"],
  ["/api/sales/bookings/export", "sales.booking.view", "sales.booking.export"],
  ["/api/sales/receipts/export", "sales.receipt.view", "sales.receipt.export"],
  ["/api/sales/site-visits/export", "sales.siteVisit.view", "sales.siteVisit.export"],
  ["/api/sales/cost-sheets/export", "sales.costSheet.view", "sales.costSheet.export"],
  ["/api/projects/projects/export", "project.project.view", "project.project.export"],
  ["/api/projects/progress/export", "project.progressLog.view", "project.progressLog.export"],
  ["/api/hr/employees/export", "hr.employee.view", "hr.employee.export"],
  ["/api/admin/users/export", "admin.user.view", "admin.user.export"],
  ["/api/admin/roles/export", "admin.role.view", "admin.role.export"],
  ["/api/admin/audit/export", "admin.audit.view", "admin.audit.export"],
  ["/api/material/grn/export", "material.grn.view", "material.grn.export"],
  ["/api/material/invoices/export", "material.vendorInvoice.view", "material.vendorInvoice.export"],
  ["/api/material/payments/export", "material.vendorPayment.view", "material.vendorPayment.export"],
  ["/api/material/issues/export", "material.issue.view", "material.issue.export"],
  ["/api/material/returns/export", "material.return.view", "material.return.export"],
  ["/api/material/transfers/export", "material.transfer.view", "material.transfer.export"],
  ["/api/material/stock/export", "material.stock.view", "material.stock.export"],
  ["/api/material/reorder/export", "material.reorder.view", "material.stock.export"],
  ["/api/material/indents/export", "material.indent.view", "material.indent.export"],
  ["/api/material/purchase-orders/export", "material.purchaseOrder.view", "material.purchaseOrder.export"],
  ["/api/material/vendors/export", "material.vendor.view", "masters.vendor.export"],
  ["/api/units/export", "unit.unit.view", "unit.unit.export"],
  ["/api/units/price-lists/export", "unit.priceList.view", "unit.priceList.export"],
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
    for (const role of ROLES) {
      const email = `${role}@nninfra.example`;
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

      for (const role of ROLES) {
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
      const xlsx = await download("/api/sales/bookings/export?format=xlsx", tokens.owner);
      expect(xlsx.status).toBe(200);
      expect([...xlsx.bytes.slice(0, 4)]).toEqual([0x50, 0x4b, 0x03, 0x04]); // zip

      const pdf = await download("/api/projects/projects/export?format=pdf", tokens.owner);
      expect(pdf.status).toBe(200);
      expect(new TextDecoder().decode(pdf.bytes.slice(0, 5))).toBe("%PDF-");
    });

    it("refuses a format it does not produce", async () => {
      expect((await download("/api/admin/roles/export?format=docx", tokens.owner)).status).toBe(400);
    });
  });

  describe("scoping carries into the file", () => {
    it("gives a sales executive only their own leads", async () => {
      const res = await download("/api/sales/leads/export?format=csv", tokens.sales);
      expect(res.status).toBe(200);
      const lines = new TextDecoder().decode(res.bytes).trim().split(/\r\n/);
      const own = await prisma.lead.count({ where: { owner: { email: "sales@nninfra.example" } } });
      expect(lines.length - 1).toBe(own);
    });

    it("never widens a project filter beyond the user's projects", async () => {
      const mapped = await prisma.userProject.findMany({
        where: { user: { email: "pm@nninfra.example" } },
        select: { projectId: true },
      });
      const foreign = await prisma.project.findFirst({
        where: { id: { notIn: mapped.map((m) => m.projectId) } },
        select: { id: true },
      });
      if (!foreign) return; // every project is mapped to the PM in this data set

      const res = await download(`/api/projects/projects/export?format=csv&project=${foreign.id}`, tokens.pm);
      if (res.status === 403) return; // PM may not export projects under this matrix
      const text = new TextDecoder().decode(res.bytes);
      const code = (await prisma.project.findUniqueOrThrow({ where: { id: foreign.id }, select: { code: true } })).code;
      expect(text).not.toContain(`"${code}"`);
    });
  });
});
