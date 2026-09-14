import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

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

import { actAs, cleanupActionSessions, bindCookieBox } from "./action-harness";
import { cleanupItemAndStore, demoProject, makeItemAndStore, n, prisma, seededUsers, tag } from "./helpers";

import * as po from "@/app/(app)/material/purchase-orders/actions";
import * as indents from "@/app/(app)/material/indents/actions";
import { isPoEditable, poTotals } from "@/lib/material/procurement";
import { applyPurchaseOrderEdit, NoLongerEditableError } from "@/lib/material/procurement-edit";

bindCookieBox(cookieBox);

/**
 * Editing before approval, against the real database. Every row here is a
 * throwaway created under a unique tag and removed afterwards.
 */
describe("procurement — editing before approval", () => {
  const suffix = tag();
  let projectId: string;
  let vendorId: string;
  let itemA: { id: string; storeId: string };
  let itemB: { id: string; storeId: string };
  let users: Awaited<ReturnType<typeof seededUsers>>;
  const poIds: string[] = [];
  const indentIds: string[] = [];

  async function makePo(status: string, overrides: Record<string, unknown> = {}) {
    const row = await prisma.purchaseOrder.create({
      data: {
        poNo: `PO/EDIT/${suffix}/${poIds.length}`,
        projectId,
        vendorId,
        createdById: users.store.id,
        subTotal: 1000, taxAmount: 180, totalAmount: 1180,
        status: status as never,
        items: { create: [{ itemId: itemA.id, orderedQty: 10, rate: 100, taxPct: 18, amount: 1180 }] },
        ...overrides,
      },
      include: { items: true },
    });
    poIds.push(row.id);
    return row;
  }

  async function makeIndent(raisedById: string, status = "DRAFT") {
    const row = await prisma.indent.create({
      data: {
        indentNo: `IND/EDIT/${suffix}/${indentIds.length}`,
        projectId,
        raisedById,
        requiredByDate: new Date("2026-12-01"),
        estimatedValue: 4500,
        status: status as never,
        items: { create: [{ itemId: itemA.id, requestedQty: 10, estimatedRate: 450 }] },
      },
      include: { items: true },
    });
    indentIds.push(row.id);
    return row;
  }

  beforeAll(async () => {
    users = await seededUsers();
    projectId = (await demoProject()).id;
    vendorId = (await prisma.vendor.findFirstOrThrow({ where: { status: "ACTIVE" } })).id;
    const a = await makeItemAndStore(`${suffix}A`, 500);
    const b = await makeItemAndStore(`${suffix}B`, 1000);
    itemA = { id: a.item.id, storeId: a.store.id };
    itemB = { id: b.item.id, storeId: b.store.id };
  });

  afterAll(async () => {
    await prisma.purchaseOrder.deleteMany({ where: { id: { in: poIds } } });
    await prisma.indent.deleteMany({ where: { id: { in: indentIds } } });
    await prisma.auditLog.deleteMany({ where: { entityId: { in: [...poIds, ...indentIds] } } });
    await cleanupItemAndStore(itemA.id, itemA.storeId);
    await cleanupItemAndStore(itemB.id, itemB.storeId);
    await cleanupActionSessions();
    await prisma.$disconnect();
  });

  const editedLines = (firstLineId: string) => [
    { id: firstLineId, itemId: itemA.id, orderedQty: 20, rate: 100, discountPct: 10, taxPct: 18 },
    { itemId: itemB.id, orderedQty: 5, rate: 200, discountPct: 0, taxPct: 5 },
  ];

  it("recomputes a draft order's totals and lines, keeping its number", async () => {
    const row = await makePo("DRAFT");
    await actAs("store@nninfra.example");

    const res = await po.updatePurchaseOrderAction(row.id, {
      vendorId, otherCharges: 50, terms: "Delivered to site", items: editedLines(row.items[0].id),
    });
    expect(res.ok, res.ok ? "" : res.error).toBe(true);

    const after = await prisma.purchaseOrder.findUniqueOrThrow({ where: { id: row.id }, include: { items: true } });
    const expected = poTotals(editedLines(row.items[0].id), 50);
    expect(n(after.subTotal)).toBeCloseTo(expected.subTotal, 2);
    expect(n(after.taxAmount)).toBeCloseTo(expected.taxAmount, 2);
    expect(n(after.totalAmount)).toBeCloseTo(3224, 2);
    expect(after.poNo).toBe(row.poNo);
    expect(after.status).toBe("DRAFT");
    expect(after.terms).toBe("Delivered to site");
    expect(after.items).toHaveLength(2);
    expect(n(after.items.find((l) => l.id === row.items[0].id)?.amount)).toBeCloseTo(2124, 2);

    const audit = await prisma.auditLog.findFirst({ where: { entityId: row.id, action: "UPDATE" } });
    expect(audit?.summary).toMatch(/Edited .* before approval/);
  });

  it("refuses an approved order and leaves it untouched", async () => {
    const approvedAt = new Date();
    const row = await makePo("APPROVED", {
      pmApprovedById: users.pm.id, pmApprovedAt: approvedAt,
      adminApprovedById: users.owner.id, adminApprovedAt: approvedAt,
      approvedById: users.owner.id, approvedAt,
    });
    await actAs("store@nninfra.example");

    const res = await po.updatePurchaseOrderAction(row.id, {
      vendorId, otherCharges: 0, items: editedLines(row.items[0].id),
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/can no longer be edited/);

    const after = await prisma.purchaseOrder.findUniqueOrThrow({ where: { id: row.id }, include: { items: true } });
    expect(n(after.totalAmount)).toBe(1180);
    expect(after.items).toHaveLength(1);
  });

  it("lets an approval that lands between the read and the write win", async () => {
    const row = await makePo("PENDING_PM_APPROVAL");

    // The editor reads the order while it is still open for editing…
    const seen = await prisma.purchaseOrder.findUniqueOrThrow({ where: { id: row.id } });
    expect(isPoEditable(seen)).toBe(true);

    // …the PM approves it before the edit is written…
    await actAs("pm@nninfra.example");
    expect((await po.approvePoPmAction(row.id)).ok).toBe(true);

    // …and the write, conditional on the approval state, refuses.
    await expect(
      prisma.$transaction((tx) =>
        applyPurchaseOrderEdit(tx, row.id, {
          vendorId, paymentTermId: null, expectedDate: null, deliveryAddress: null, terms: null,
          otherCharges: 0, items: editedLines(row.items[0].id),
        }),
      ),
    ).rejects.toBeInstanceOf(NoLongerEditableError);

    const after = await prisma.purchaseOrder.findUniqueOrThrow({ where: { id: row.id }, include: { items: true } });
    expect(after.status).toBe("PENDING_ADMIN_APPROVAL");
    expect(n(after.totalAmount)).toBe(1180);
    expect(after.items).toHaveLength(1);
    expect(n(after.items[0].orderedQty)).toBe(10);
  });

  it("refuses an indent edit by someone who neither raised it nor sees every indent", async () => {
    const row = await makeIndent(users.pm.id);
    await actAs("supervisor@nninfra.example");

    const res = await indents.updateIndentAction(row.id, {
      requiredByDate: "2026-12-15",
      items: [{ id: row.items[0].id, itemId: itemA.id, requestedQty: 99 }],
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe("material.indent.viewAll");

    const after = await prisma.indent.findUniqueOrThrow({ where: { id: row.id }, include: { items: true } });
    expect(n(after.items[0].requestedQty)).toBe(10);
  });

  it("lets the raiser edit, keeping a line's rate and valuing a new item at standard", async () => {
    const row = await makeIndent(users.supervisor.id, "SUBMITTED");
    await actAs("supervisor@nninfra.example");

    const res = await indents.updateIndentAction(row.id, {
      requiredByDate: "2026-12-15",
      purpose: "Edited in test",
      items: [
        { id: row.items[0].id, itemId: itemA.id, requestedQty: 20 },
        { itemId: itemB.id, requestedQty: 3 },
      ],
    });
    expect(res.ok, res.ok ? "" : res.error).toBe(true);

    const after = await prisma.indent.findUniqueOrThrow({ where: { id: row.id }, include: { items: true } });
    // 20 × 450 (kept) + 3 × 1000 (standard rate of the new item)
    expect(n(after.estimatedValue)).toBe(12_000);
    expect(after.status).toBe("SUBMITTED");
    expect(after.indentNo).toBe(row.indentNo);
    expect(after.purpose).toBe("Edited in test");
    expect(after.items).toHaveLength(2);
  });

  it("refuses an indent once an approval step is recorded", async () => {
    const row = await makeIndent(users.supervisor.id, "SUBMITTED");
    await prisma.indentApproval.create({
      data: { indentId: row.id, level: "PM", decision: "RETURNED", approvedById: users.pm.id },
    });
    await actAs("supervisor@nninfra.example");

    const res = await indents.updateIndentAction(row.id, {
      requiredByDate: "2026-12-15",
      items: [{ id: row.items[0].id, itemId: itemA.id, requestedQty: 50 }],
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/can no longer be edited/);
  });
});
