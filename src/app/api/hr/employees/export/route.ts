import { prisma } from "@/lib/db";
import { capRows, EXPORT_MAX_ROWS, exportGate, exportResponse, listWindow } from "@/lib/exports/respond";
import { employeeFigures } from "@/lib/metrics/figures";
import { bandOf, type ScreenShell } from "@/lib/screens/rows";
import { employeeDecisions } from "@/lib/records/employee";
import { EMPLOYEE_EMPTY, employeeScreenRow } from "@/lib/screens/rows/hr";
import { describeEmployeeFilters, employeeListWhere, maskId, readEmployeeListParams } from "@/lib/hr/list-filters";
import { PERM } from "@/lib/permissions/codes";

export const dynamic = "force-dynamic";

/**
 * Exports the employee list — every employee matching the Employees tab's
 * search, employment type and designation. Aadhaar and PAN are masked, as on
 * screen, for anyone who may not see identity numbers.
 */
export async function GET(request: Request) {
  const gate = await exportGate(request, PERM.hr.employee.view, PERM.hr.employee.export);
  if (!gate.ok) return gate.response;
  const { ctx, params } = gate;

  const listParams = readEmployeeListParams(params);
  const canIdentity = ctx.has(PERM.hr.employee.viewIdentity);

  const [employees, type, designation] = await Promise.all([
    prisma.employee.findMany({
      where: employeeListWhere(listParams),
      orderBy: { name: "asc" },
      take: EXPORT_MAX_ROWS + 1,
      include: {
        employmentType: { select: { name: true } },
        designation: { select: { name: true } },
        _count: { select: { documents: true } },
      },
    }),
    listParams.type
      ? prisma.employmentType.findUnique({ where: { id: listParams.type }, select: { name: true } })
      : null,
    listParams.designation
      ? prisma.designation.findUnique({ where: { id: listParams.designation }, select: { name: true } })
      : null,
  ]);
  const { rows, note } = capRows(employees);

  /* The screen, for the app: the Employees tab's row, with identity numbers
   * masked exactly as the file masks them, and the band the web opens with. */
  let screen: ScreenShell | undefined;
  if (gate.format === "json") {
    const { from, to } = listWindow(gate.params, rows.length);
    /*
     * The band the web opens with — including who has not been marked today,
     * which is the figure a supervisor acts on. Today, because the Employees
     * tab has no date of its own.
     */
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const statRows = await prisma.employee.findMany({
      select: {
        status: true,
        attendance: { where: { attendanceOn: today }, select: { status: true, overtimeHours: true } },
      },
    });
    screen = {
      rows: rows.slice(from, to).map((e) =>
        employeeScreenRow({
          id: e.id,
          name: e.name,
          code: e.employeeCode,
          mobile: e.mobile,
          altContact: e.altContact,
          designation: e.designation?.name ?? null,
          employmentType: e.employmentType.name,
          aadhaar: canIdentity ? e.aadhaar : maskId(e.aadhaar),
          pan: canIdentity ? e.pan : maskId(e.pan),
          address: e.address,
          status: e.status,
        },
        employeeDecisions(
          { id: e.id, status: e.status },
          {
            update: ctx.has(PERM.hr.employee.update),
            remove: ctx.has(PERM.hr.employee.delete),
          },
        )),
      ),
      band: bandOf(employeeFigures(statRows)),
      empty: EMPLOYEE_EMPTY,
    };
  }

  const filters = describeEmployeeFilters(listParams, {
    type: type?.name ?? null,
    designation: designation?.name ?? null,
  }) + (canIdentity ? "" : " · Identity numbers masked");

  return exportResponse({
    ...gate,
    screen,
    title: "Employees",
    entity: "Employee",
    filters,
    result: {
      columns: [
        { key: "code", header: "Employee code" },
        { key: "name", header: "Name" },
        { key: "mobile", header: "Mobile" },
        { key: "altContact", header: "Alternate contact" },
        { key: "type", header: "Employment type" },
        { key: "designation", header: "Designation" },
        { key: "aadhaar", header: "Aadhaar" },
        { key: "pan", header: "PAN" },
        { key: "address", header: "Address" },
        { key: "status", header: "Status" },
        { key: "joinedOn", header: "Joined on", format: "date" },
        { key: "documents", header: "Documents", align: "right", format: "number" },
      ],
      rows: rows.map((e) => ({
        id: e.id,
        code: e.employeeCode,
        name: e.name,
        mobile: e.mobile,
        altContact: e.altContact ?? "",
        type: e.employmentType.name,
        designation: e.designation?.name ?? "",
        aadhaar: (canIdentity ? e.aadhaar : maskId(e.aadhaar)) ?? "",
        pan: (canIdentity ? e.pan : maskId(e.pan)) ?? "",
        address: e.address ?? "",
        status: e.status === "ACTIVE" ? "Active" : e.status === "INACTIVE" ? "Inactive" : e.status,
        joinedOn: e.joinedOn,
        documents: e._count.documents,
      })),
      summary: [{ label: "Employees", value: note }],
      emptyMessage: "No employees match these filters.",
    },
  });
}
