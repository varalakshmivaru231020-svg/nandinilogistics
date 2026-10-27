import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { prisma } from "../integration/helpers";
import { revokeTestSessions, sessionFor, serverIsUp, visit } from "./session";

/** This file's own session tag, so a parallel file cannot revoke its cookies. */
const LABEL = "access-control";

/**
 * End-to-end proof that the permission model is enforced by the server, not
 * merely reflected in the UI. Requires `pnpm dev` (or `pnpm start`) running.
 */

const up = await serverIsUp();
const suite = up ? describe : describe.skip;

if (!up) {
  console.warn("\n  E2E skipped — start the app with `pnpm dev` to run these.\n");
}

export const ROLE_EMAILS: Record<string, string> = {
  admin: "admin@nandini.example",
  tl: "tl@nandini.example",
  telecaller: "telecaller@nandini.example",
  rider: "rider@nandini.example",
};

const tokens: Record<string, string> = {};

suite("access control, end to end", () => {
  beforeAll(async () => {
    for (const [role, email] of Object.entries(ROLE_EMAILS)) {
      tokens[role] = await sessionFor(email, LABEL);
    }
  });

  afterAll(async () => {
    await revokeTestSessions(LABEL);
    await prisma.$disconnect();
  });

  describe("unauthenticated visitors", () => {
    it("are sent to the login screen from a guarded page", async () => {
      const res = await visit("/dashboard");
      expect(res.status).toBe(307);
      expect(res.location).toContain("/login");
    });

    it("cannot reach the admin area", async () => {
      const res = await visit("/admin/roles");
      expect(res.status).toBe(307);
      expect(res.location).toContain("/login");
    });

    it("can still reach the login page", async () => {
      expect((await visit("/login")).status).toBe(200);
    });
  });

  describe("route guards follow the role matrix", () => {
    const matrix: Array<[route: string, allowed: string[], denied: string[]]> = [
      ["/sales/leads", ["admin", "tl", "telecaller"], ["rider"]],
      ["/sales/follow-ups", ["admin", "tl", "telecaller"], ["rider"]],
      // A rider may open these, scoped to their own record only.
      ["/hr/riders", ["admin", "tl", "telecaller", "rider"], []],
      ["/hr/staff", ["admin", "tl", "telecaller", "rider"], []],
      ["/hr/attendance", ["admin", "tl", "telecaller", "rider"], []],
      ["/approvals", ["admin", "tl"], ["telecaller", "rider"]],
      ["/tasks", ["admin", "tl"], ["telecaller", "rider"]],
      ["/masters/companies", ["admin", "tl", "telecaller"], ["rider"]],
      ["/masters/lead-stages", ["admin"], ["tl", "telecaller", "rider"]],
      ["/admin/roles", ["admin"], ["tl", "telecaller", "rider"]],
      ["/admin/audit", ["admin"], ["tl", "telecaller", "rider"]],
      ["/admin/users", ["admin"], ["tl", "telecaller", "rider"]],
      ["/hr/onboarding", ["admin", "tl", "telecaller"], []],
      ["/hr/referrals", ["admin", "tl", "rider"], ["telecaller"]],
      ["/payouts", ["admin", "tl", "telecaller", "rider"], []],
      ["/payouts/imports", ["admin"], ["tl", "telecaller", "rider"]],
      ["/advances", ["admin", "tl", "rider"], ["telecaller"]],
      ["/advances/bike-rent", ["admin", "tl"], ["telecaller", "rider"]],
      ["/accounts/invoices", ["admin"], ["tl", "telecaller", "rider"]],
      ["/staff/payslips", ["admin"], ["tl", "telecaller", "rider"]],
      ["/reports/teamLeader", ["admin", "tl"], ["telecaller", "rider"]],
      ["/reports/payoutSummary", ["admin"], ["tl", "telecaller", "rider"]],
    ];

    for (const [route, allowed, denied] of matrix) {
      for (const role of allowed) {
        it(`lets ${role} open ${route}`, async () => {
          expect((await visit(route, tokens[role])).status).toBe(200);
        });
      }
      for (const role of denied) {
        it(`stops ${role} at ${route}`, async () => {
          const res = await visit(route, tokens[role]);
          expect(res.status).toBe(307);
          expect(res.location).toContain("/forbidden");
        });
      }
    }
  });

  describe("the denial names the missing permission", () => {
    it("tells the user exactly which code they lack", async () => {
      const res = await visit("/masters/lead-stages", tokens.telecaller);
      expect(res.location).toContain("code=masters.leadStage.view");
    });
  });

  describe("controls are gated individually, not just pages", () => {
    it("gives a Team Leader the company list with no action controls", async () => {
      const { html } = await visit("/masters/companies", tokens.tl);
      expect(html).toContain("Companies");
      expect(html).not.toContain('title="Edit"');
      expect(html).not.toContain('title="Delete"');
    });

    it("shows Admin edit and deactivate on the company master", async () => {
      const { html } = await visit("/masters/companies", tokens.admin);
      expect(html).toContain('title="Edit"');
      expect(html).toContain('title="Deactivate"');
    });
  });

  describe("the lead detail screen", () => {
    it("shows Admin every tab the SOW defines", async () => {
      const lead = await prisma.lead.findFirst({ select: { id: true } });
      if (!lead) return;
      const { status, html } = await visit(`/sales/leads/${lead.id}`, tokens.admin);
      expect(status).toBe(200);
      for (const tab of ["Timeline", "Follow-ups", "Notes", "Stage", "Files"]) {
        expect(html, `missing tab ${tab}`).toContain(tab);
      }
    });

    it("refuses a tele-caller a lead that is not theirs", async () => {
      const other = await prisma.lead.findFirst({
        where: { owner: { email: { not: ROLE_EMAILS.telecaller } } },
        select: { id: true },
      });
      if (!other) return;
      const res = await visit(`/sales/leads/${other.id}`, tokens.telecaller);
      expect(res.status).toBe(404);
    });

    it("opens a tele-caller's own lead", async () => {
      const own = await prisma.lead.findFirst({
        where: { owner: { email: ROLE_EMAILS.telecaller } },
        select: { id: true },
      });
      if (!own) return;
      expect((await visit(`/sales/leads/${own.id}`, tokens.telecaller)).status).toBe(200);
    });
  });

  describe("the dashboard follows the role", () => {
    for (const role of Object.keys(ROLE_EMAILS)) {
      it(`renders for ${role}`, async () => {
        expect((await visit("/dashboard", tokens[role])).status).toBe(200);
      });
    }
  });
});
