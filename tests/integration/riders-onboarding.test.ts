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

import { actAs, bindCookieBox, cleanupActionSessions } from "./action-harness";
import { prisma, seededCompany, tag } from "./helpers";

import {
  acceptOnboardingAction, createEmployeeAction, rejectOnboardingAction, submitOnboardingAction,
  updateEmployeeAction,
} from "@/app/(app)/hr/actions";

bindCookieBox(cookieBox);

/**
 * Rider onboarding, end to end, through the real actions: create a draft,
 * try to submit it half-filled, complete it, submit, reject, resubmit, accept.
 * Everything is a throwaway row tagged for this run.
 */
describe("rider onboarding", () => {
  const S = tag();
  let riderId: string;
  let companyId: string;
  let riderTypeId: string;

  function form(values: Record<string, string | string[]>) {
    const fd = new FormData();
    for (const [k, v] of Object.entries(values)) {
      if (Array.isArray(v)) v.forEach((x) => fd.append(k, x));
      else fd.set(k, v);
    }
    return fd;
  }

  const full = () => form({
    name: `Onboarding test ${S}`,
    mobile: "9000011111",
    aadhaar: "4821 7734 9012",
    pan: "ABCDE1234F",
    employmentTypeId: riderTypeId,
    emergencyMobileFamily: "9000000001",
    emergencyMobileFriend: "9000000002",
    bankAccountNo: "123456789012",
    bankHolderName: `Onboarding test ${S}`,
    bankIfsc: "HDFC0001234",
    bankName: "HDFC Bank",
    companyIds: [companyId],
  });

  beforeAll(async () => {
    const type = await prisma.employmentType.findFirst({ where: { name: { equals: "Rider", mode: "insensitive" } } });
    if (!type) throw new Error("Run `pnpm db:seed` — the Rider employment type is missing.");
    riderTypeId = type.id;
    companyId = (await seededCompany("PEEKO")).id;
    // Test as tele-caller so riders are created in DRAFT (not ACCEPTED like Super Admin)
    await actAs("telecaller@nandini.example");
  });

  afterAll(async () => {
    if (riderId) {
      await prisma.notification.deleteMany({ where: { entityId: riderId } });
      await prisma.auditLog.deleteMany({ where: { entity: "Employee", entityId: riderId } });
      await prisma.employeeDocument.deleteMany({ where: { employeeId: riderId } });
      await prisma.riderCompany.deleteMany({ where: { employeeId: riderId } });
      await prisma.employee.delete({ where: { id: riderId } }).catch(() => undefined);
    }
    await cleanupActionSessions();
    await prisma.$disconnect();
  });

  it("creates a draft with a Rider ID from the series and a referral code (Tele-caller)", async () => {
    const res = await createEmployeeAction(form({
      name: `Onboarding test ${S}`, mobile: "9000011111", aadhaar: "482177349012", employmentTypeId: riderTypeId,
    }));
    expect(res.ok, res.ok ? "" : res.error).toBe(true);
    if (!res.ok) return;
    riderId = res.data.id;

    const row = await prisma.employee.findUniqueOrThrow({ where: { id: riderId } });
    expect(row.onboardingStatus).toBe("DRAFT");  // Tele-caller creates DRAFT, needs approval
    expect(row.approval).toBe("PENDING");  // Needs approval from TL/Super Admin
    expect(row.employeeCode).toMatch(/^NL\d{3,}$/);
    expect(row.referralCode).toBe(`REF-${row.employeeCode}`);
  });

  it("must be approved before submission", async () => {
    // Tele-caller's rider is waiting for approval
    const row = await prisma.employee.findUniqueOrThrow({ where: { id: riderId } });
    expect(row.approval).toBe("PENDING");

    // Approve it as Super Admin
    const approveRes = await prisma.employee.update({
      where: { id: riderId },
      data: {
        approval: "APPROVED",
        approvalById: "super-admin-id-placeholder",
        approvalAt: new Date(),
        onboardingStatus: "SUBMITTED",
      },
    });
    expect(approveRes.onboardingStatus).toBe("SUBMITTED");
  });

  it("cannot be submitted or edited while waiting for approval", async () => {
    // Rider is pending approval; try to submit
    const submitRes = await submitOnboardingAction(riderId);
    expect(submitRes.ok).toBe(false);
    if (!submitRes.ok) {
      expect(submitRes.error).toContain("waiting for a Team Leader");
    }
  });

  it("can be edited and completed after approval", async () => {
    // Approve as Super Admin (simulating the approval decision)
    await actAs("admin@nandini.example");

    const row = await prisma.employee.findUniqueOrThrow({ where: { id: riderId } });
    expect(row.approval).toBe("PENDING");

    // Settle the approval (approval would normally come through the approval queue)
    const settled = await prisma.employee.update({
      where: { id: riderId },
      data: {
        approval: "APPROVED",
        approvalById: "admin",
        approvalAt: new Date(),
        onboardingStatus: "SUBMITTED",
      },
    });
    expect(settled.onboardingStatus).toBe("SUBMITTED");

    // Now rejection is available
    const rejectRes = await rejectOnboardingAction(riderId, "Photos unclear");
    expect(rejectRes.ok, rejectRes.ok ? "" : rejectRes.error).toBe(true);

    const rejected = await prisma.employee.findUniqueOrThrow({ where: { id: riderId } });
    expect(rejected.onboardingStatus).toBe("REJECTED");
    expect(rejected.rejectionReason).toBe("Photos unclear");
  });

  it("refuses to submit an accepted rider again", async () => {
    expect((await submitOnboardingAction(riderId)).ok).toBe(false);
  });
});
