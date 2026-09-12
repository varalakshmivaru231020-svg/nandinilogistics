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

bindCookieBox(cookieBox);

/**
 * The design approves a purchase order in two levels and restarts both on a
 * revision. What matters is that the second level cannot be reached without
 * the first, and that a revision genuinely clears what came before.
 */
describe("purchase order — two-level approval", () => {
  const suffix = tag();
  let projectId: string;
  let vendorId: string;
  const created: string[] = [];

  async function makePo(status = "PENDING_PM_APPROVAL", overrides: Record<string, unknown> = {}) {
    const row = await prisma.purchaseOrder.create({
      data: {
        poNo: `PO-${suffix}-${created.length}`,
        projectId,
        vendorId,
        createdById: (await prisma.user.findFirstOrThrow({ where: { email: "store@nninfra.example" } })).id,
        subTotal: 1000, taxAmount: 0, totalAmount: 1000,
        status: status as never,
        ...overrides,
      },
    });
    created.push(row.id);
    return row;
  }

  beforeAll(async () => {
    const project = await demoProject();
    projectId = project.id;
    vendorId = (await prisma.vendor.findFirstOrThrow()).id;
  });

  afterAll(async () => {
    await prisma.purchaseOrder.deleteMany({ where: { id: { in: created } } });
    await cleanupActionSessions();
    await prisma.$disconnect();
  });

  it("refuses the PM level to someone without that permission", async () => {
    const row = await makePo();
    await actAs("sales@nninfra.example");
    const res = await po.approvePoPmAction(row.id);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe("material.purchaseOrder.approvePm");
  });

  it("moves to the admin level after the PM approves, and records who", async () => {
    const row = await makePo();
    await actAs("pm@nninfra.example");
    expect((await po.approvePoPmAction(row.id)).ok).toBe(true);

    const after = await prisma.purchaseOrder.findUniqueOrThrow({ where: { id: row.id } });
    expect(after.status).toBe("PENDING_ADMIN_APPROVAL");
    expect(after.pmApprovedById).not.toBeNull();
    expect(after.adminApprovedById).toBeNull();
  });

  it("will not take an admin approval before the PM one", async () => {
    const row = await makePo();
    await actAs("owner@nninfra.example");
    const res = await po.approvePoAdminAction(row.id);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/Project Manager approval first/i);
  });

  it("will not take the same level twice", async () => {
    const row = await makePo();
    await actAs("pm@nninfra.example");
    expect((await po.approvePoPmAction(row.id)).ok).toBe(true);
    const again = await po.approvePoPmAction(row.id);
    expect(again.ok).toBe(false);
    if (!again.ok) expect(again.error).toMatch(/already has its Project Manager approval/i);
  });

  it("is approved only after both levels, and records both", async () => {
    const row = await makePo();
    await actAs("pm@nninfra.example");
    await po.approvePoPmAction(row.id);
    await actAs("owner@nninfra.example");
    expect((await po.approvePoAdminAction(row.id)).ok).toBe(true);

    const after = await prisma.purchaseOrder.findUniqueOrThrow({ where: { id: row.id } });
    expect(after.status).toBe("APPROVED");
    expect(after.pmApprovedById).not.toBeNull();
    expect(after.adminApprovedById).not.toBeNull();
  });

  it("a revision raises the number and clears both approvals", async () => {
    const row = await makePo();
    await actAs("pm@nninfra.example");
    await po.approvePoPmAction(row.id);
    await actAs("owner@nninfra.example");
    await po.approvePoAdminAction(row.id);

    const res = await po.revisePurchaseOrderAction(row.id, "Rate renegotiated");
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data.revision).toBe(1);

    const after = await prisma.purchaseOrder.findUniqueOrThrow({ where: { id: row.id } });
    expect(after.status).toBe("PENDING_PM_APPROVAL");
    expect(after.pmApprovedById).toBeNull();
    expect(after.adminApprovedById).toBeNull();
    expect(after.approvedById).toBeNull();
  });

  it("refuses a revision without a reason", async () => {
    const row = await makePo("APPROVED");
    await actAs("owner@nninfra.example");
    const res = await po.revisePurchaseOrderAction(row.id, "   ");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/reason/i);
  });

  it("refuses to revise a draft — that is just an edit", async () => {
    const row = await makePo("DRAFT");
    await actAs("owner@nninfra.example");
    const res = await po.revisePurchaseOrderAction(row.id, "Changed my mind");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/Only an approved purchase order/i);
  });
});
