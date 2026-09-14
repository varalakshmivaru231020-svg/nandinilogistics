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
import { prisma, demoProject, tag } from "./helpers";

import * as po from "@/app/(app)/material/purchase-orders/actions";
import * as indents from "@/app/(app)/material/indents/actions";

bindCookieBox(cookieBox);

/**
 * An approver must never decide on figures that changed under them. The screen
 * sends back the `updatedAt` it loaded; the action refuses when the record has
 * moved on since, and its own write is conditional on what it checked.
 */
describe("decisions on purchase orders and indents refuse stale records", () => {
  const suffix = tag();
  let projectId: string;
  let vendorId: string;
  let storeUserId: string;
  const pos: string[] = [];
  const indentIds: string[] = [];

  async function makePo(status = "PENDING_PM_APPROVAL") {
    const row = await prisma.purchaseOrder.create({
      data: {
        poNo: `PO-STALE-${suffix}-${pos.length}`,
        projectId,
        vendorId,
        createdById: storeUserId,
        subTotal: 1000, taxAmount: 0, totalAmount: 1000,
        status: status as never,
      },
    });
    pos.push(row.id);
    return row;
  }

  async function makeIndent(status = "SUBMITTED") {
    const row = await prisma.indent.create({
      data: {
        indentNo: `IND-STALE-${suffix}-${indentIds.length}`,
        projectId,
        raisedById: storeUserId,
        requiredByDate: new Date(Date.now() + 7 * 86_400_000),
        status: status as never,
      },
    });
    indentIds.push(row.id);
    return row;
  }

  /** Someone else's edit: the record moves on after the approver loaded it. */
  async function editBehindTheirBack(model: "purchaseOrder" | "indent", id: string) {
    // A millisecond later at least, so the stored timestamp is guaranteed to differ.
    await new Promise((r) => setTimeout(r, 5));
    if (model === "purchaseOrder") {
      await prisma.purchaseOrder.update({ where: { id }, data: { terms: `edited ${Date.now()}` } });
    } else {
      await prisma.indent.update({ where: { id }, data: { purpose: `edited ${Date.now()}` } });
    }
  }

  beforeAll(async () => {
    projectId = (await demoProject()).id;
    vendorId = (await prisma.vendor.findFirstOrThrow()).id;
    storeUserId = (await prisma.user.findFirstOrThrow({ where: { email: "store@nninfra.example" } })).id;
  });

  afterAll(async () => {
    await prisma.indentApproval.deleteMany({ where: { indentId: { in: indentIds } } });
    await prisma.indent.deleteMany({ where: { id: { in: indentIds } } });
    await prisma.purchaseOrder.deleteMany({ where: { id: { in: pos } } });
    await cleanupActionSessions();
    await prisma.$disconnect();
  });

  describe("purchase orders", () => {
    it("refuses a PM approval of figures that changed after the approver opened the order", async () => {
      const row = await makePo();
      const seen = row.updatedAt.toISOString();
      await editBehindTheirBack("purchaseOrder", row.id);

      await actAs("pm@nninfra.example");
      const res = await po.approvePoPmAction(row.id, "", seen);
      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.error).toMatch(/changed after you opened it/i);

      const after = await prisma.purchaseOrder.findUniqueOrThrow({ where: { id: row.id } });
      expect(after.status).toBe("PENDING_PM_APPROVAL");
      expect(after.pmApprovedById).toBeNull();
    });

    it("approves when the approver saw the current figures", async () => {
      const row = await makePo();
      await actAs("pm@nninfra.example");
      const res = await po.approvePoPmAction(row.id, "", row.updatedAt.toISOString());
      expect(res.ok).toBe(true);
      expect((await prisma.purchaseOrder.findUniqueOrThrow({ where: { id: row.id } })).status).toBe("PENDING_ADMIN_APPROVAL");
    });

    it("still approves when no screen version is sent (callers without a screen)", async () => {
      const row = await makePo();
      await actAs("pm@nninfra.example");
      expect((await po.approvePoPmAction(row.id)).ok).toBe(true);
    });

    it("refuses an admin approval once the PM-approved order was touched again", async () => {
      const row = await makePo();
      await actAs("pm@nninfra.example");
      expect((await po.approvePoPmAction(row.id)).ok).toBe(true);
      const seen = (await prisma.purchaseOrder.findUniqueOrThrow({ where: { id: row.id } })).updatedAt.toISOString();
      await editBehindTheirBack("purchaseOrder", row.id);

      await actAs("owner@nninfra.example");
      const res = await po.approvePoAdminAction(row.id, "", seen);
      expect(res.ok).toBe(false);
      expect((await prisma.purchaseOrder.findUniqueOrThrow({ where: { id: row.id } })).status).toBe("PENDING_ADMIN_APPROVAL");
    });

    it("refuses to cancel or close a stale order", async () => {
      const toCancel = await makePo("APPROVED");
      const seenCancel = toCancel.updatedAt.toISOString();
      await editBehindTheirBack("purchaseOrder", toCancel.id);
      await actAs("owner@nninfra.example");
      const cancel = await po.cancelPurchaseOrderAction(toCancel.id, "No longer needed", seenCancel);
      expect(cancel.ok).toBe(false);
      expect((await prisma.purchaseOrder.findUniqueOrThrow({ where: { id: toCancel.id } })).status).toBe("APPROVED");

      const toClose = await makePo("APPROVED");
      const seenClose = toClose.updatedAt.toISOString();
      await editBehindTheirBack("purchaseOrder", toClose.id);
      const close = await po.closePurchaseOrderAction(toClose.id, seenClose);
      expect(close.ok).toBe(false);
      expect((await prisma.purchaseOrder.findUniqueOrThrow({ where: { id: toClose.id } })).status).toBe("APPROVED");
    });

    it("closes only an approved order", async () => {
      const pending = await makePo("PENDING_PM_APPROVAL");
      await actAs("owner@nninfra.example");
      const res = await po.closePurchaseOrderAction(pending.id, pending.updatedAt.toISOString());
      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.error).toMatch(/only an approved order can be closed/i);
    });
  });

  describe("indents", () => {
    it("refuses a PM approval of an indent edited after the approver opened it", async () => {
      const row = await makeIndent();
      const seen = row.updatedAt.toISOString();
      await editBehindTheirBack("indent", row.id);

      await actAs("pm@nninfra.example");
      const res = await indents.approveIndentAction(row.id, "PM", "", [], seen);
      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.error).toMatch(/changed after you opened it/i);

      expect((await prisma.indent.findUniqueOrThrow({ where: { id: row.id } })).status).toBe("SUBMITTED");
      expect(await prisma.indentApproval.count({ where: { indentId: row.id } })).toBe(0);
    });

    it("approves an indent the approver saw as it is", async () => {
      const row = await makeIndent();
      await actAs("pm@nninfra.example");
      const res = await indents.approveIndentAction(row.id, "PM", "", [], row.updatedAt.toISOString());
      expect(res.ok).toBe(true);
      expect(await prisma.indentApproval.count({ where: { indentId: row.id } })).toBe(1);
    });

    it("refuses to reject or cancel a stale indent", async () => {
      const toReject = await makeIndent();
      const seenReject = toReject.updatedAt.toISOString();
      await editBehindTheirBack("indent", toReject.id);
      await actAs("pm@nninfra.example");
      const reject = await indents.rejectIndentAction(toReject.id, "Not required", seenReject);
      expect(reject.ok).toBe(false);
      expect((await prisma.indent.findUniqueOrThrow({ where: { id: toReject.id } })).status).toBe("SUBMITTED");
      expect(await prisma.indentApproval.count({ where: { indentId: toReject.id } })).toBe(0);

      const toCancel = await makeIndent();
      const seenCancel = toCancel.updatedAt.toISOString();
      await editBehindTheirBack("indent", toCancel.id);
      await actAs("owner@nninfra.example");
      const cancel = await indents.cancelIndentAction(toCancel.id, "", seenCancel);
      expect(cancel.ok).toBe(false);
      expect((await prisma.indent.findUniqueOrThrow({ where: { id: toCancel.id } })).status).toBe("SUBMITTED");
    });
  });
});
