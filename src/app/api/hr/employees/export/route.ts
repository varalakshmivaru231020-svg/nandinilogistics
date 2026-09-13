import { prisma } from "@/lib/db";
import { capRows, EXPORT_MAX_ROWS, exportGate, exportResponse } from "@/lib/exports/respond";
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

  const filters = describeEmployeeFilters(listParams, {
    type: type?.name ?? null,
    designation: designation?.name ?? null,
  }) + (canIdentity ? "" : " · Identity numbers masked");

  return exportResponse({
    ...gate,
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
