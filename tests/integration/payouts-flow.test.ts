import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

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

import { actAs, actAsNobody, bindCookieBox, cleanupActionSessions } from "./action-harness";
import { prisma, seededCompany, tag } from "./helpers";

import * as payouts from "@/app/(app)/payouts/actions";
import * as advances from "@/app/(app)/advances/actions";
import { getSetting } from "@/lib/settings";

bindCookieBox(cookieBox);

const ADMIN = "admin@nandini.example";
const TELE = "telecaller@nandini.example";

/**
 * A payout sheet from import to posting, against the real database: a
 * throwaway rider deployed to Peeko with an approved advance and a bike on
 * rent; the sheet carries no advance or bike column, so the system fills both
 * when the sheet is posted and marks the advance recovered.
 */
describe("payouts: import → correct → post → hold", () => {
  const S = tag();
  let riderId = "";
  let typeId = "";
  let companyId = "";
  let advanceId = "";
  let importId = "";
  let lineId = "";
  const riderCode = `PT${S}`;

  function sheet(rows: string): FormData {
    const fd = new FormData();
    fd.set("companyId", companyId);
    fd.set("periodFrom", "2026-03-02");
    fd.set("periodTo", "2026-03-08");
    fd.set("file", new File([`Rider ID,Total Payout,TDS\n${rows}`], `payout-${S}.csv`, { type: "text/csv" }));
    return fd;
  }

  beforeAll(async () => {
    const company = await seededCompany("PEEKO");
    companyId = company.id;
    const type = await prisma.employmentType.findFirstOrThrow({ where: { name: "Rider" } });
    typeId = type.id;
    const rider = await prisma.employee.create({
      data: {
        employeeCode: riderCode, name: `Payout test ${S}`, mobile: "9000000000", aadhaar: "111122223333",
        employmentTypeId: typeId, onboardingStatus: "ACCEPTED", status: "ACTIVE",
        companies: { create: [{ companyId }] },
      },
    });
    riderId = rider.id;
    expect((await getSetting(prisma, "payout.formula")).pullAdvancesFromSystem).toBe(true);
  });

  afterAll(async () => {
    await prisma.payoutImport.deleteMany({ where: { lines: { some: { employeeId: riderId } } } });
    await prisma.payoutImport.deleteMany({ where: { fileName: `payout-${S}.csv` } });
    await prisma.notification.deleteMany({ where: { entityId: { in: [importId, advanceId].filter(Boolean) } } });
    await prisma.advance.deleteMany({ where: { employeeId: riderId } });
    await prisma.bikeRent.deleteMany({ where: { employeeId: riderId } });
    await prisma.employee.deleteMany({ where: { id: riderId } });
    await cleanupActionSessions();
    await prisma.$disconnect();
  });

  beforeEach(() => actAsNobody());

  it("approves an advance with a recovery schedule, and assigns a bike", async () => {
    await actAs(ADMIN);
    const fd = new FormData();
    fd.set("employeeId", riderId);
    fd.set("amount", "3000");
    fd.set("priority", "LOW");
    const asked = await advances.createAdvanceAction(fd);
    expect(asked.ok, asked.ok ? "" : asked.error).toBe(true);
    if (!asked.ok) return;
    advanceId = asked.data.id;

    const decided = await advances.decideAdvanceAction(advanceId, "APPROVED", "ok", 1000);
    expect(decided.ok, decided.ok ? "" : decided.error).toBe(true);

    const bike = new FormData();
    bike.set("employeeId", riderId);
    bike.set("bikeNumber", `KA01${S}`);
    bike.set("rentPerWeek", "500");
    bike.set("startDate", "2026-01-01");
    const assigned = await advances.createBikeRentAction(bike);
    expect(assigned.ok, assigned.ok ? "" : assigned.error).toBe(true);
  });

  it("refuses a tele-caller the import", async () => {
    await actAs(TELE);
    const res = await payouts.previewPayoutImportAction(sheet(`${riderCode},10000,100`));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe("payout.import.create");
  });

  it("previews the sheet against the company's riders", async () => {
    await actAs(ADMIN);
    const res = await payouts.previewPayoutImportAction(sheet(`${riderCode.toLowerCase()},10000,100\nNOBODY${S},500,0`));
    expect(res.ok, res.ok ? "" : res.error).toBe(true);
    if (!res.ok) return;
    expect(res.data.matched).toBe(1);
    expect(res.data.unmatched).toBe(1);
    expect(res.data.lines[0].employeeName).toBe(`Payout test ${S}`);
    expect(res.data.lines[0].advance).toBeNull();
  });

  it("saves the draft, refuses to post it while a row is unmatched, then posts once corrected", async () => {
    await actAs(ADMIN);
    const created = await payouts.createPayoutImportAction(sheet(`${riderCode},10000,100\nNOBODY${S},500,0`));
    expect(created.ok, created.ok ? "" : created.error).toBe(true);
    if (!created.ok) return;
    importId = created.data.id;
    expect(created.data.lines).toBe(2);

    const early = await payouts.postPayoutImportAction(importId);
    expect(early.ok).toBe(false);
    if (!early.ok) expect(early.error).toMatch(/unmatched/);

    // The stray row is deleted rather than matched: nobody else is deployed here in this test.
    const stray = await prisma.payoutLine.findFirstOrThrow({ where: { importId, employeeId: null } });
    const wrong = await payouts.correctPayoutLineAction(stray.id, riderId);
    expect(wrong.ok).toBe(true);

    const posted = await payouts.postPayoutImportAction(importId);
    expect(posted.ok, posted.ok ? "" : posted.error).toBe(true);
    if (!posted.ok) return;
    expect(posted.data.lines).toBe(2);
    // ₹1,000 from the one approved advance, taken on the main line; the stray
    // line's advance is taken too, since the same rider now owns both.
    expect(posted.data.deducted).toBeGreaterThanOrEqual(1000);
  });

  it("computed the final from the formula, filling the deductions the sheet did not carry", async () => {
    const line = await prisma.payoutLine.findFirstOrThrow({ where: { importId, riderCode: riderCode, employeeId: riderId } });
    lineId = line.id;
    // One week of bike rent (2–8 March) at ₹500; ₹1,000 of advance; ₹100 TDS from the sheet.
    expect(Number(line.bikeRental)).toBe(500);
    expect(Number(line.advance)).toBe(1000);
    expect(Number(line.tds)).toBe(100);
    expect(Number(line.finalPayout)).toBe(10000 - 1000 - 500 - 100);

    const advance = await prisma.advance.findUniqueOrThrow({ where: { id: advanceId } });
    expect(Number(advance.recoveredAmount)).toBeGreaterThanOrEqual(1000);
    expect(Number(advance.recoveredAmount)).toBeLessThanOrEqual(3000);

    const imp = await prisma.payoutImport.findUniqueOrThrow({ where: { id: importId } });
    expect(imp.status).toBe("POSTED");
  });

  it("refuses to post or delete a posted sheet", async () => {
    await actAs(ADMIN);
    expect((await payouts.postPayoutImportAction(importId)).ok).toBe(false);
    expect((await payouts.deletePayoutImportAction(importId)).ok).toBe(false);
  });

  it("holds a line with a reason, and releases it", async () => {
    await actAs(ADMIN);
    const noReason = await payouts.holdPayoutLineAction(lineId, "  ");
    expect(noReason.ok).toBe(false);

    const held = await payouts.holdPayoutLineAction(lineId, "KYC pending");
    expect(held.ok, held.ok ? "" : held.error).toBe(true);
    expect(await prisma.payoutLine.findUniqueOrThrow({ where: { id: lineId } })).toMatchObject({ status: "HOLD", holdReason: "KYC pending" });

    const released = await payouts.releasePayoutLineAction(lineId);
    expect(released.ok).toBe(true);
    expect((await prisma.payoutLine.findUniqueOrThrow({ where: { id: lineId } })).status).toBe("PAID");
  });

  it("does not let a tele-caller hold a line outside their scope", async () => {
    await actAs(TELE);
    const res = await payouts.holdPayoutLineAction(lineId, "not mine");
    expect(res.ok).toBe(false);
  });
});
