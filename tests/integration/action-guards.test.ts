import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// Hoisted so the module stub below can read it — this is the only piece of a
// request the actions actually need.
const cookieBox = vi.hoisted(() => ({ value: null as string | null }));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      name === "nn_session" && cookieBox.value ? { name, value: cookieBox.value } : undefined,
    set: () => undefined,
    delete: () => undefined,
  }),
  headers: async () => new Map<string, string>(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: () => undefined,
  revalidateTag: () => undefined,
}));

import { actAs, actAsNobody, cleanupActionSessions, bindCookieBox } from "./action-harness";
import { prisma, demoProject, seededUsers, makeItemAndStore, cleanupItemAndStore, tag, n } from "./helpers";

import * as indentActions from "@/app/(app)/material/indents/actions";
import * as masterActions from "@/app/(app)/masters/actions";
import * as invoiceActions from "@/app/(app)/material/invoices/actions";

bindCookieBox(cookieBox);

/**
 * These call the real server actions. Only `cookies()` is stubbed — permission
 * resolution, approval routing, value ceilings and the database writes are the
 * production code paths.
 */
describe("server actions enforce permissions on the write path", () => {
  const suffix = tag();
  let itemId: string;
  let storeId: string;

  beforeAll(async () => {
    const { item, store } = await makeItemAndStore(suffix);
    itemId = item.id;
    storeId = store.id;
  });

  afterAll(async () => {
    await prisma.indent.deleteMany({ where: { indentNo: { contains: suffix } } });
    await cleanupItemAndStore(itemId, storeId);
    await cleanupActionSessions();
    await prisma.$disconnect();
    vi.restoreAllMocks();
  });

  beforeEach(() => actAsNobody());

  describe("an unauthenticated caller", () => {
    it("cannot create a master record", async () => {
      const form = new FormData();
      form.set("code", `X${suffix}`);
      form.set("name", "Should never exist");
      const res = await masterActions.createMasterAction("departments", form);
      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.error).toMatch(/sign-in/i);
    });

    it("writes nothing when refused", async () => {
      const found = await prisma.department.findFirst({ where: { code: `X${suffix}` } });
      expect(found).toBeNull();
    });
  });

  describe("a user without the permission", () => {
    it("is refused, and told which permission is missing", async () => {
      await actAs("supervisor@nninfra.example");
      const form = new FormData();
      form.set("code", `V${suffix}`);
      form.set("name", "Blocked vendor");
      const res = await masterActions.createMasterAction("vendors", form);
      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.code).toBe("masters.vendor.create");
    });

    it("is refused a delete it is explicitly denied, even holding the rest", async () => {
      // Store Manager has masters.item.* but is denied masters.item.delete.
      await actAs("store@nninfra.example");
      const created = await prisma.item.findFirstOrThrow({ where: { id: itemId } });
      const res = await masterActions.deleteMasterAction("items", created.id);
      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.code).toBe("masters.item.delete");
    });

    it("leaves the record intact after the refusal", async () => {
      expect(await prisma.item.findUnique({ where: { id: itemId } })).not.toBeNull();
    });
  });

  describe("a user with the permission", () => {
    it("creates the record and writes an audit row", async () => {
      await actAs("owner@nninfra.example");
      const form = new FormData();
      form.set("code", `D${suffix}`);
      form.set("name", `Test department ${suffix}`);
      form.set("description", "");

      const res = await masterActions.createMasterAction("departments", form);
      expect(res.ok).toBe(true);
      if (!res.ok) return;

      const audit = await prisma.auditLog.findFirst({
        where: { entity: "department", entityId: res.data.id, action: "CREATE" },
      });
      expect(audit).not.toBeNull();
      expect(audit?.summary).toContain(`D${suffix}`);

      await prisma.department.delete({ where: { id: res.data.id } });
    });
  });
});

describe("indent approval routing runs the real ceiling logic", () => {
  const suffix = tag();
  let itemId: string;
  let storeId: string;
  let projectId: string;
  const indentIds: string[] = [];

  beforeAll(async () => {
    const [{ item, store }, project] = await Promise.all([makeItemAndStore(suffix), demoProject()]);
    itemId = item.id;
    storeId = store.id;
    projectId = project.id;
  });

  afterAll(async () => {
    await prisma.indentApproval.deleteMany({ where: { indentId: { in: indentIds } } });
    await prisma.indent.deleteMany({ where: { id: { in: indentIds } } });
    await cleanupItemAndStore(itemId, storeId);
    await cleanupActionSessions();
    await prisma.$disconnect();
  });

  async function makeIndent(rate: number, qtyOrdered: number) {
    const users = await seededUsers();
    const indent = await prisma.indent.create({
      data: {
        indentNo: `IND/ACT/${suffix}/${indentIds.length + 1}`,
        projectId,
        raisedById: users.supervisor.id,
        requiredByDate: new Date(Date.now() + 7 * 86_400_000),
        estimatedValue: rate * qtyOrdered,
        status: "SUBMITTED",
        items: {
          create: [{ itemId, requestedQty: qtyOrdered, estimatedRate: rate }],
        },
      },
    });
    indentIds.push(indent.id);
    return indent;
  }

  /*
   * Approval is the Project Manager's one step. It used to route by value —
   * under the PM's ceiling it completed, over it waited for Owner / Admin — and
   * the client asked for the second step to go, so a PM decision now clears an
   * indent whatever it is worth.
   */
  it("clears the indent when the PM approves within their ceiling", async () => {
    // PM ceiling is ₹500,000 — this is ₹100,000.
    const indent = await makeIndent(500, 200);
    await actAs("pm@nninfra.example");

    const res = await indentActions.approveIndentAction(indent.id, "PM", "Within budget");
    expect(res.ok).toBe(true);
    if (!res.ok) return;

    expect(res.data.status).toBe("ADMIN_APPROVED");
    expect(res.data.skippedAdmin).toBe(false);
  });

  it("clears it in the same one step when the PM is over their ceiling", async () => {
    // ₹1,000,000 — above the PM's ₹500,000 ceiling, and no longer a second step.
    const indent = await makeIndent(500, 2000);
    await actAs("pm@nninfra.example");

    const res = await indentActions.approveIndentAction(indent.id, "PM", "Site cannot wait");
    expect(res.ok).toBe(true);
    if (!res.ok) return;

    expect(res.data.status).toBe("ADMIN_APPROVED");
  });

  it("records a quantity revision on the approval trail", async () => {
    const indent = await makeIndent(500, 200);
    const line = await prisma.indentItem.findFirstOrThrow({ where: { indentId: indent.id } });

    await actAs("pm@nninfra.example");
    const res = await indentActions.approveIndentAction(indent.id, "PM", "Trimmed to BOQ", [
      { itemId: line.id, approvedQty: 150 },
    ]);
    expect(res.ok).toBe(true);

    const approval = await prisma.indentApproval.findFirstOrThrow({
      where: { indentId: indent.id },
    });
    expect(approval.changes).toBeTruthy();

    const updated = await prisma.indentItem.findFirstOrThrow({ where: { id: line.id } });
    expect(n(updated.approvedQty)).toBe(150);
  });

  it("revalues the indent from the revised quantity", async () => {
    const indent = indentIds.at(-1)!;
    const row = await prisma.indent.findUniqueOrThrow({ where: { id: indent } });
    expect(n(row.estimatedValue)).toBe(150 * 500);
  });

  it("refuses a supervisor the approval entirely", async () => {
    const indent = await makeIndent(500, 100);
    await actAs("supervisor@nninfra.example");

    const res = await indentActions.approveIndentAction(indent.id, "PM", "");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe("material.indent.approvePm");
  });

  it("leaves the indent unapproved after a refusal", async () => {
    const row = await prisma.indent.findUniqueOrThrow({ where: { id: indentIds.at(-1)! } });
    expect(row.status).toBe("SUBMITTED");
  });

  it("refuses approval at a level the indent is not waiting for", async () => {
    const indent = await makeIndent(500, 100);
    await actAs("owner@nninfra.example");

    // It is SUBMITTED, so it is waiting for PM — not Admin.
    const res = await indentActions.approveIndentAction(indent.id, "ADMIN", "");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/not waiting for ADMIN/i);
  });

  it("requires a reason when rejecting", async () => {
    const indent = await makeIndent(500, 100);
    await actAs("pm@nninfra.example");

    const blank = await indentActions.rejectIndentAction(indent.id, "   ");
    expect(blank.ok).toBe(false);

    const withReason = await indentActions.rejectIndentAction(indent.id, "Specification unclear");
    expect(withReason.ok).toBe(true);

    const row = await prisma.indent.findUniqueOrThrow({ where: { id: indent.id } });
    expect(row.status).toBe("REJECTED");
  });
});

describe("a blocked invoice cannot be approved without the override", () => {
  afterAll(async () => {
    await cleanupActionSessions();
    await prisma.$disconnect();
  });

  it("refuses a plain approval while the match is failing", async () => {
    const invoice = await prisma.vendorInvoice.findFirst({ where: { status: "MISMATCH" } });
    if (!invoice) return;

    await actAs("owner@nninfra.example");
    const res = await invoiceActions.approveInvoiceAction(invoice.id, "Looks fine", false);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/three-way match/i);
  });

  it("refuses an override to someone without that permission", async () => {
    const invoice = await prisma.vendorInvoice.findFirst({ where: { status: "MISMATCH" } });
    if (!invoice) return;

    await actAs("store@nninfra.example");
    const res = await invoiceActions.approveInvoiceAction(invoice.id, "Please pay", true);
    expect(res.ok).toBe(false);
  });

  it("requires a written justification even from someone who may override", async () => {
    const invoice = await prisma.vendorInvoice.findFirst({ where: { status: "MISMATCH" } });
    if (!invoice) return;

    await actAs("owner@nninfra.example");
    const res = await invoiceActions.approveInvoiceAction(invoice.id, "   ", true);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/justification/i);
  });

  it("leaves the invoice blocked after every refusal", async () => {
    const invoice = await prisma.vendorInvoice.findFirst({ where: { invoiceNo: "BM/2026/4471" } });
    if (!invoice) return;
    expect(invoice.status).toBe("MISMATCH");
  });
});
