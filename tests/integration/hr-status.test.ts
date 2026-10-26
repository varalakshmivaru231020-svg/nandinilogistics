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
import { prisma, tag } from "./helpers";

import {
  markAttendanceAction, setEmployeeStatusAction, updateEmployeeAction,
} from "@/app/(app)/hr/actions";
import { claimEmployeeStatus } from "@/lib/hr/employee-status";

bindCookieBox(cookieBox);

/**
 * Employee status and the edit audit, against the real database — on
 * throwaway employees and a throwaway employment type only.
 */
describe("hr: employee status and edit audit", () => {
  const S = tag();
  let typeId: string;
  const employeeIds: string[] = [];
  const day = "2026-01-05";

  async function makeEmployee(status = "ACTIVE") {
    const n = employeeIds.length;
    const e = await prisma.employee.create({
      data: {
        employeeCode: `TST-${S}-${n}`,
        name: `Status test ${S} ${n}`,
        mobile: "9000000000",
        aadhaar: `11112222${String(3000 + n)}`,
        employmentTypeId: typeId,
        status,
      },
    });
    employeeIds.push(e.id);
    return e;
  }

  function form(values: Record<string, string>) {
    const fd = new FormData();
    for (const [k, v] of Object.entries(values)) fd.set(k, v);
    return fd;
  }

  beforeAll(async () => {
    typeId = (await prisma.employmentType.create({ data: { name: `Test type ${S}` } })).id;
    await actAs("admin@nandini.example");
  });

  afterAll(async () => {
    await prisma.attendanceEntry.deleteMany({ where: { employeeId: { in: employeeIds } } });
    await prisma.auditLog.deleteMany({ where: { entity: "Employee", entityId: { in: employeeIds } } });
    await prisma.employee.deleteMany({ where: { id: { in: employeeIds } } });
    await prisma.employmentType.deleteMany({ where: { id: typeId } });
    await cleanupActionSessions();
    await prisma.$disconnect();
  });

  it("refuses to deactivate without a reason, and deactivates with one", async () => {
    const e = await makeEmployee();

    const refused = await setEmployeeStatusAction(e.id, "INACTIVE", "  ");
    expect(refused.ok).toBe(false);
    expect((await prisma.employee.findUniqueOrThrow({ where: { id: e.id } })).status).toBe("ACTIVE");

    const done = await setEmployeeStatusAction(e.id, "INACTIVE", "Left the site");
    expect(done.ok).toBe(true);
    expect((await prisma.employee.findUniqueOrThrow({ where: { id: e.id } })).status).toBe("INACTIVE");

    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { entity: "Employee", entityId: e.id }, orderBy: { createdAt: "desc" },
    });
    expect(audit.summary).toContain("Left the site");
    expect(audit.changes).toMatchObject({ status: { from: "ACTIVE", to: "INACTIVE" } });

    expect((await setEmployeeStatusAction(e.id, "ACTIVE", "")).ok).toBe(true);
    expect((await prisma.employee.findUniqueOrThrow({ where: { id: e.id } })).status).toBe("ACTIVE");
  });

  it("refuses attendance for an inactive employee and writes nothing for the batch", async () => {
    const active = await makeEmployee();
    const inactive = await makeEmployee("INACTIVE");

    const res = await markAttendanceAction(day, [
      { employeeId: active.id, status: "PRESENT", overtimeHours: 1 },
      { employeeId: inactive.id, status: "PRESENT" },
    ]);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/inactive/);
    expect(await prisma.attendanceEntry.count({ where: { employeeId: { in: [active.id, inactive.id] } } })).toBe(0);

    // The active employee alone is marked.
    expect((await markAttendanceAction(day, [{ employeeId: active.id, status: "PRESENT" }])).ok).toBe(true);
    expect(await prisma.attendanceEntry.count({ where: { employeeId: active.id } })).toBe(1);
  });

  it("keeps attendance recorded before deactivation", async () => {
    const e = await makeEmployee();
    expect((await markAttendanceAction(day, [{ employeeId: e.id, status: "HALF_DAY" }])).ok).toBe(true);
    expect((await setEmployeeStatusAction(e.id, "INACTIVE", "Contract ended")).ok).toBe(true);
    expect(await prisma.attendanceEntry.count({ where: { employeeId: e.id } })).toBe(1);
  });

  it("loses a status write guarded on a stale status", async () => {
    const e = await makeEmployee();
    // Two people read ACTIVE. The first deactivates…
    expect(await claimEmployeeStatus(prisma, e.id, "ACTIVE", "INACTIVE")).toBe(true);
    // …then the second, still holding ACTIVE, tries to write — and loses.
    expect(await claimEmployeeStatus(prisma, e.id, "ACTIVE", "INACTIVE")).toBe(false);

    // A reactivation claimed against the stale ACTIVE read cannot undo it either.
    await prisma.employee.update({ where: { id: e.id }, data: { status: "INACTIVE" } });
    expect(await claimEmployeeStatus(prisma, e.id, "ACTIVE", "ACTIVE")).toBe(false);
    expect((await prisma.employee.findUniqueOrThrow({ where: { id: e.id } })).status).toBe("INACTIVE");
  });

  it("records every changed field on edit, with Aadhaar and PAN masked", async () => {
    const e = await makeEmployee();
    const otherType = await prisma.employmentType.create({ data: { name: `Test type B ${S}` } });
    try {
      const res = await updateEmployeeAction(e.id, form({
        name: `${e.name} renamed`,
        mobile: "9111111111",
        aadhaar: "999988887777",
        pan: "ABCDE1234F",
        address: "12 Site Road",
        altContact: "",
        employmentTypeId: otherType.id,
        designationId: "",
      }));
      expect(res.ok).toBe(true);

      const audit = await prisma.auditLog.findFirstOrThrow({
        where: { entity: "Employee", entityId: e.id, action: "UPDATE" }, orderBy: { createdAt: "desc" },
      });
      const changes = audit.changes as Record<string, { from: unknown; to: unknown }>;
      expect(Object.keys(changes).sort()).toEqual(["aadhaar", "address", "employmentTypeId", "mobile", "name", "pan"]);
      expect(changes.name).toEqual({ from: e.name, to: `${e.name} renamed` });
      expect(changes.mobile).toEqual({ from: "9000000000", to: "9111111111" });
      expect(changes.employmentTypeId).toEqual({ from: typeId, to: otherType.id });
      expect(changes.address).toEqual({ from: null, to: "12 Site Road" });
      expect(changes.aadhaar).toEqual({ from: `•••••••• ${e.aadhaar.slice(-4)}`, to: "•••••••• 7777" });
      expect(changes.pan).toEqual({ from: null, to: "•••••• 234F" });
      expect(JSON.stringify(audit.changes)).not.toContain("999988887777");
      expect(JSON.stringify(audit.changes)).not.toContain("ABCDE1234F");
    } finally {
      await prisma.employee.update({ where: { id: e.id }, data: { employmentTypeId: typeId } });
      await prisma.employmentType.delete({ where: { id: otherType.id } });
    }
  });
});
