import { requirePermission } from "@/lib/rbac/guard";
import { prisma } from "@/lib/db";
import { PERM } from "@/lib/permissions/codes";
import { PageHeader } from "@/components/ui/primitives";
import { HrScreen } from "./hr-screen";

export const metadata = { title: "Users & Attendance" };

/** Masks all but the last four digits, as lead phone numbers are masked. */
function maskId(value: string | null) {
  if (!value) return null;
  return value.length > 4 ? `${"•".repeat(Math.min(8, value.length - 4))} ${value.slice(-4)}` : "••••";
}

export default async function WorkforcePage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; date?: string; from?: string; to?: string; q?: string }>;
}) {
  const ctx = await requirePermission(PERM.hr.employee.view);
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const {
    tab = "staff",
    date = today,
    from = new Date(now.getTime() - 6 * 86_400_000).toISOString().slice(0, 10),
    to = today,
    q = "",
  } = await searchParams;

  const canIdentity = ctx.has(PERM.hr.employee.viewIdentity);

  const [employees, employmentTypes, designations] = await Promise.all([
    prisma.employee.findMany({
      where: q.trim()
        ? {
            OR: [
              { name: { contains: q.trim(), mode: "insensitive" } },
              { employeeCode: { contains: q.trim(), mode: "insensitive" } },
              { mobile: { contains: q.trim() } },
            ],
          }
        : {},
      orderBy: { name: "asc" },
      include: {
        employmentType: { select: { id: true, name: true } },
        designation: { select: { id: true, name: true } },
        documents: { select: { id: true, kind: true, fileName: true, fileSize: true } },
      },
    }),
    prisma.employmentType.findMany({
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      include: { _count: { select: { employees: true } } },
    }),
    prisma.designation.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);

  // The day being marked.
  const markDate = new Date(`${date}T00:00:00.000Z`);
  const dayEntries = ctx.has(PERM.hr.attendance.view)
    ? await prisma.attendanceEntry.findMany({
        where: { attendanceOn: markDate },
        select: { employeeId: true, status: true, overtimeHours: true },
      })
    : [];

  // The report range.
  const reportRows = ctx.has(PERM.hr.attendance.tabReport)
    ? await prisma.attendanceEntry.groupBy({
        by: ["employeeId", "status"],
        where: {
          attendanceOn: {
            gte: new Date(`${from}T00:00:00.000Z`),
            lte: new Date(`${to}T00:00:00.000Z`),
          },
        },
        _count: { _all: true },
        _sum: { overtimeHours: true },
      })
    : [];

  return (
    <div className="mx-auto max-w-[1400px]">
      <PageHeader
        title="Users & Attendance"
        description="Everyone on site and in the office, and the day-by-day record of who worked."
      />
      <HrScreen
        tab={tab}
        date={date}
        from={from}
        to={to}
        query={q}
        employees={employees.map((e) => ({
          id: e.id,
          code: e.employeeCode,
          name: e.name,
          mobile: e.mobile,
          altContact: e.altContact,
          aadhaar: canIdentity ? e.aadhaar : maskId(e.aadhaar),
          pan: canIdentity ? e.pan : maskId(e.pan),
          address: e.address,
          employmentTypeId: e.employmentType.id,
          employmentType: e.employmentType.name,
          designationId: e.designation?.id ?? null,
          designation: e.designation?.name ?? null,
          documents: e.documents,
        }))}
        employmentTypes={employmentTypes.map((t) => ({
          id: t.id,
          name: t.name,
          count: t._count.employees,
          canDelete: t._count.employees === 0,
        }))}
        designations={designations}
        dayMarks={dayEntries.map((e) => ({
          employeeId: e.employeeId,
          status: e.status,
          overtimeHours: Number(e.overtimeHours),
        }))}
        report={reportRows.map((r) => ({
          employeeId: r.employeeId,
          status: r.status,
          days: r._count._all,
          overtime: Number(r._sum.overtimeHours ?? 0),
        }))}
        can={{
          create: ctx.has(PERM.hr.employee.create),
          update: ctx.has(PERM.hr.employee.update),
          remove: ctx.has(PERM.hr.employee.delete),
          viewIdentity: canIdentity,
          manageTypes: ctx.has(PERM.hr.employmentType.create),
          deleteTypes: ctx.has(PERM.hr.employmentType.delete),
          viewAttendance: ctx.has(PERM.hr.attendance.view),
          mark: ctx.has(PERM.hr.attendance.mark),
          markAll: ctx.has(PERM.hr.attendance.markAll),
          report: ctx.has(PERM.hr.attendance.tabReport),
          exportReport: ctx.has(PERM.hr.attendance.export),
        }}
      />
    </div>
  );
}
