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
    await actAs("admin@nandini.example");
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

  it("creates a draft with a Rider ID from the series and a referral code", async () => {
    const res = await createEmployeeAction(form({
      name: `Onboarding test ${S}`, mobile: "9000011111", aadhaar: "482177349012", employmentTypeId: riderTypeId,
    }));
    expect(res.ok, res.ok ? "" : res.error).toBe(true);
    if (!res.ok) return;
    riderId = res.data.id;

    const row = await prisma.employee.findUniqueOrThrow({ where: { id: riderId } });
    expect(row.onboardingStatus).toBe("DRAFT");
    expect(row.employeeCode).toMatch(/^NL\d{3,}$/);
    expect(row.referralCode).toBe(`REF-${row.employeeCode}`);
  });

  it("refuses to submit a half-filled form, naming what is missing", async () => {
    const res = await submitOnboardingAction(riderId);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error).toContain("Emergency mobile");
      expect(res.error).toContain("At least one company");
      expect(res.error).toContain("Aadhaar front photo");
    }
  });

  it("submits once the particulars, the companies and the KYC copies are there", async () => {
    expect((await updateEmployeeAction(riderId, full())).ok).toBe(true);
    // The photograph and the two Aadhaar copies, written as the form would store them.
    await prisma.employee.update({ where: { id: riderId }, data: { photoKey: `test/${S}/photo.jpg` } });
    for (const kind of ["Aadhaar front", "Aadhaar back"]) {
      await prisma.employeeDocument.create({
        data: { employeeId: riderId, kind, storageKey: `test/${S}/${kind}.jpg`, fileName: `${kind}.jpg`, fileSize: 10 },
      });
    }

    const res = await submitOnboardingAction(riderId);
    expect(res.ok, res.ok ? "" : res.error).toBe(true);
    const row = await prisma.employee.findUniqueOrThrow({ where: { id: riderId } });
    expect(row.onboardingStatus).toBe("SUBMITTED");
    expect(row.submittedAt).not.toBeNull();
    expect((await prisma.riderCompany.count({ where: { employeeId: riderId } }))).toBe(1);
  });

  it("cannot be accepted twice over, and rejection needs a reason", async () => {
    expect((await rejectOnboardingAction(riderId, " ")).ok).toBe(false);
    const res = await rejectOnboardingAction(riderId, "Aadhaar back is blurred");
    expect(res.ok, res.ok ? "" : res.error).toBe(true);
    const row = await prisma.employee.findUniqueOrThrow({ where: { id: riderId } });
    expect(row.onboardingStatus).toBe("REJECTED");
    expect(row.rejectionReason).toBe("Aadhaar back is blurred");
    expect((await acceptOnboardingAction(riderId)).ok).toBe(false);
  });

  it("can be resubmitted after rejection and then accepted, which activates the rider", async () => {
    expect((await submitOnboardingAction(riderId)).ok).toBe(true);
    const res = await acceptOnboardingAction(riderId);
    expect(res.ok, res.ok ? "" : res.error).toBe(true);

    const row = await prisma.employee.findUniqueOrThrow({ where: { id: riderId } });
    expect(row.onboardingStatus).toBe("ACCEPTED");
    expect(row.status).toBe("ACTIVE");
    expect(row.joinedOn).not.toBeNull();
    expect(row.decidedById).not.toBeNull();
    expect(row.rejectionReason).toBeNull();
    // Peeko carries the seeded vendor template, so the letter is produced.
    expect(row.offerLetterKey).not.toBeNull();

    const audit = await prisma.auditLog.findFirst({
      where: { entity: "Employee", entityId: riderId, action: "APPROVE" },
    });
    expect(audit?.summary).toContain("accepted");
  });

  it("refuses to submit an accepted rider again", async () => {
    expect((await submitOnboardingAction(riderId)).ok).toBe(false);
  });
});
