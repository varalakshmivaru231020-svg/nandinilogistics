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

const tokens: Record<string, string> = {};

suite("access control, end to end", () => {
  beforeAll(async () => {
    for (const role of ["owner", "pm", "supervisor", "store", "sales", "saleshead"]) {
      tokens[role] = await sessionFor(`${role}@nninfra.example`, LABEL);
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
      ["/masters/items", ["owner", "store", "supervisor"], ["sales"]],
      ["/material/purchase-orders", ["owner", "store", "pm"], ["sales", "supervisor"]],
      ["/material/invoices", ["owner", "store"], ["sales", "supervisor", "pm"]],
      ["/sales/leads", ["owner", "sales", "saleshead"], ["store", "supervisor", "pm"]],
      ["/units/board", ["owner", "sales", "saleshead"], ["store", "supervisor"]],
      ["/admin/roles", ["owner"], ["sales", "store", "supervisor", "pm"]],
      ["/admin/audit", ["owner"], ["sales", "store", "supervisor", "pm"]],
      ["/reports/stockValuation", ["owner", "store"], ["sales"]],
      ["/reports/salesFunnel", ["owner", "sales"], ["store", "supervisor"]],
      ["/schedule", ["owner", "pm", "supervisor"], ["sales"]],
      // Held pending client verification: the screens are previews, but the
      // permission behind them is real and only the Owner holds it.
      // Workforce and the knowledge base, per the design's own access map:
      // the supervisor holds both; sales sees only the knowledge base.
      ["/hr", ["owner", "pm", "supervisor"], ["sales"]],
      ["/kb", ["owner", "pm", "supervisor", "store", "sales"], []],
      /*
       * Tasks and checklists are participatory: anybody can be given a task,
       * raise one, or be named on a review level, so the role matrix hands the
       * codes to every role and src/lib/tasks/lifecycle.ts decides who may act
       * on the task in front of them. The page is open; the actions are not.
       */
      ["/tasks", ["owner", "pm", "supervisor", "store", "sales", "saleshead"], []],
      ["/checklists", ["owner", "pm", "supervisor", "store", "sales", "saleshead"], []],
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
      const res = await visit("/masters/items", tokens.sales);
      expect(res.location).toContain("code=masters.item.view");
    });
  });

  describe("controls are gated individually, not just pages", () => {
    it("shows Store Manager edit and deactivate on the item master", async () => {
      const { html } = await visit("/masters/items", tokens.store);
      expect(html).toContain('title="Edit"');
      expect(html).toContain('title="Deactivate"');
    });

    it("withholds delete from Store Manager, who is explicitly denied it", async () => {
      const { html } = await visit("/masters/items", tokens.store);
      expect(html).not.toContain('title="Delete"');
    });

    it("gives Supervisor the item list with no action controls at all", async () => {
      const { html } = await visit("/masters/items", tokens.supervisor);
      expect(html).toContain("Material Items");
      expect(html).not.toContain('title="Edit"');
      expect(html).not.toContain('title="Delete"');
    });

    it("hides lead assignment from a sales executive", async () => {
      const { html } = await visit("/sales/leads?view=list", tokens.sales);
      expect(html).not.toContain('title="Assign"');
    });

    /*
     * The design keeps a lead's actions on the lead's own screen rather than in
     * the pipeline, so reassignment is offered there.
     */
    it("offers lead reassignment to the sales head, on the lead itself", async () => {
      const lead = await prisma.lead.findFirst({ select: { id: true } });
      if (!lead) return;
      const { html } = await visit(`/sales/leads/${lead.id}`, tokens.saleshead);
      expect(html).toMatch(/Reassign|Assign/);
    });

    it("hides reassignment from a sales executive", async () => {
      const own = await prisma.lead.findFirst({
        where: { owner: { email: "sales@nninfra.example" } },
        select: { id: true },
      });
      if (!own) return;
      const { html } = await visit(`/sales/leads/${own.id}`, tokens.sales);
      expect(html).not.toMatch(/>Reassign/);
    });
  });

  /*
   * Tasks and Checklists were inert previews once, then real screens the Owner
   * alone could open. Both are now participatory by design — every role holds
   * the view codes, and what a person may DO is decided per task by
   * src/lib/tasks/lifecycle.ts (tests/unit/task-lifecycle.test.ts covers that
   * matrix). So what is asserted here is that they are real screens for a
   * participant, not that they refuse one.
   */
  describe("tasks and checklists are real screens, open to participants", () => {
    for (const route of ["/tasks", "/checklists"]) {
      it(`serves ${route} to the Owner`, async () => {
        const { status, html } = await visit(route, tokens.owner);
        expect(status).toBe(200);
        expect(html).not.toContain("pending client verification");
      });

      it(`serves ${route} to a participant who is not the Owner`, async () => {
        const { status, html } = await visit(route, tokens.sales);
        expect(status).toBe(200);
        expect(html).not.toContain("pending client verification");
      });
    }
  });

  describe("the lead detail screen", () => {
    it("shows the sales head every tab the design defines", async () => {
      const lead = await prisma.lead.findFirst({ select: { id: true } });
      if (!lead) return;
      const { status, html } = await visit(`/sales/leads/${lead.id}`, tokens.saleshead);
      expect(status).toBe(200);
      for (const tab of ["Timeline", "Follow-ups", "Notes", "Stage History", "Files", "Flats"]) {
        expect(html, `missing tab ${tab}`).toContain(tab);
      }
      expect(html).toContain("Back to leads");
    });

    it("refuses a sales executive a lead that is not theirs", async () => {
      const other = await prisma.lead.findFirst({
        where: { owner: { email: { not: "sales@nninfra.example" } } },
        select: { id: true },
      });
      if (!other) return;
      const res = await visit(`/sales/leads/${other.id}`, tokens.sales);
      expect(res.status).toBe(404);
    });

    it("opens a sales executive's own lead", async () => {
      const own = await prisma.lead.findFirst({
        where: { owner: { email: "sales@nninfra.example" } },
        select: { id: true },
      });
      if (!own) return;
      expect((await visit(`/sales/leads/${own.id}`, tokens.sales)).status).toBe(200);
    });

    it("keeps the lead screen away from the store manager entirely", async () => {
      const lead = await prisma.lead.findFirst({ select: { id: true } });
      if (!lead) return;
      const res = await visit(`/sales/leads/${lead.id}`, tokens.store);
      expect(res.status).toBe(307);
      expect(res.location).toContain("/forbidden");
    });
  });

  describe("row-level scoping", () => {
    it("shows a sales executive only their own leads", async () => {
      const { html } = await visit("/sales/leads?view=list", tokens.sales);
      const own = await prisma.lead.count({
        where: { owner: { email: "sales@nninfra.example" } },
      });
      const shown = new Set(html.match(/LD\/\d{5}/g) ?? []);
      expect(shown.size).toBe(own);
    });

    it("shows the owner every lead", async () => {
      const { html } = await visit("/sales/leads?view=list", tokens.owner);
      const total = await prisma.lead.count();
      const shown = new Set(html.match(/LD\/\d{5}/g) ?? []);
      expect(shown.size).toBe(total);
    });
  });

  describe("approval steps respect the permission behind them", () => {
    it("offers PM-level approval to a project manager", async () => {
      const indent = await prisma.indent.findFirst({ where: { status: "SUBMITTED" } });
      if (!indent) return;
      const { html } = await visit(`/material/indents/${indent.id}`, tokens.pm);
      expect(html).toContain("Approve — PM level");
    });

    it("tells a supervisor it is waiting on someone else", async () => {
      const indent = await prisma.indent.findFirst({ where: { status: "SUBMITTED" } });
      if (!indent) return;
      const { html } = await visit(`/material/indents/${indent.id}`, tokens.supervisor);
      expect(html).not.toContain("Approve — PM level");
      expect(html).toContain("Waiting on Project Manager approval");
    });
  });

  describe("a blocked three-way match cannot be waved through", () => {
    it("shows the store manager the block but no override", async () => {
      const invoice = await prisma.vendorInvoice.findFirst({ where: { status: "MISMATCH" } });
      if (!invoice) return;
      const { html } = await visit(`/material/invoices/${invoice.id}`, tokens.store);
      expect(html).toContain("blocking payment");
      expect(html).not.toContain("Override &amp; approve");
    });

    it("offers the override to the owner, who holds that permission", async () => {
      const invoice = await prisma.vendorInvoice.findFirst({ where: { status: "MISMATCH" } });
      if (!invoice) return;
      const { html } = await visit(`/material/invoices/${invoice.id}`, tokens.owner);
      expect(html).toContain("Override &amp; approve");
    });
  });

  describe("session revocation takes effect immediately", () => {
    it("stops accepting a revoked session on the very next request", async () => {
      const token = await sessionFor("sales@nninfra.example", LABEL);
      expect((await visit("/dashboard", token)).status).toBe(200);

      const { payload } = JSON.parse(
        Buffer.from(token.split(".")[1], "base64").toString(),
      ) as never as { payload?: never };
      void payload;

      // Revoke this file's sessions, then try again with the same cookie.
      await revokeTestSessions(LABEL);
      const after = await visit("/dashboard", token);
      expect(after.status).toBe(307);
      expect(after.location).toContain("/login");

      // Re-mint for any remaining tests in the file.
      for (const role of ["owner", "pm", "supervisor", "store", "sales", "saleshead"]) {
        tokens[role] = await sessionFor(`${role}@nninfra.example`, LABEL);
      }
    });
  });
});
