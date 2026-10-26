import { prisma } from "@/lib/db";
import { capRows, EXPORT_MAX_ROWS, exportGate, exportResponse, listWindow } from "@/lib/exports/respond";
import { employeeFigures } from "@/lib/metrics/figures";
import { bandOf, type ScreenShell } from "@/lib/screens/rows";
import { employeeDecisions } from "@/lib/records/employee";
import { EMPLOYEE_EMPTY, employeeScreenRow } from "@/lib/screens/rows/hr";
import {
  describeEmployeeFilters, employeeListWhere, employeeScope, maskId, readEmployeeListParams,
} from "@/lib/hr/list-filters";
import { ONBOARDING_LABEL, type OnboardingStatus } from "@/lib/riders/onboarding";
import { PERM } from "@/lib/permissions/codes";

export const dynamic = "force-dynamic";

/**
 * Exports the Riders & Staff list — everyone in the viewer's scope matching
 * the tab's search, employment type, designation, company and status. Aadhaar,
 * PAN and bank numbers are masked, as on screen, for anyone who may not see
 * identity numbers.
 */
export async function GET(request: Request) {
  const gate = await exportGate(request, PERM.hr.employee.view, PERM.hr.employee.export);
  if (!gate.ok) return gate.response;
  const { ctx, params } = gate;

  const listParams = readEmployeeListParams(params);
  const canIdentity = ctx.has(PERM.hr.employee.viewIdentity);
  const scope = employeeScope(ctx);

  const [employees, type, designation, company] = await Promise.all([
    prisma.employee.findMany({
      where: { AND: [scope, employeeListWhere(listParams)] },
      orderBy: { name: "asc" },
      take: EXPORT_MAX_ROWS + 1,
      include: {
        employmentType: { select: { name: true } },
        designation: { select: { name: true } },
        companies: { select: { company: { select: { name: true } } } },
        _count: { select: { documents: true } },
      },
    }),
    listParams.type
      ? prisma.employmentType.findUnique({ where: { id: listParams.type }, select: { name: true } })
      : null,
    listParams.designation
      ? prisma.designation.findUnique({ where: { id: listParams.designation }, select: { name: true } })
      : null,
    listParams.company
      ? prisma.company.findUnique({ where: { id: listParams.company }, select: { name: true } })
      : null,
  ]);
  const { rows, note } = capRows(employees);

  /* The screen, for the app: the tab's row, with identity numbers masked
   * exactly as the file masks them, and the band the web opens with. */
  let screen: ScreenShell | undefined;
  if (gate.format === "json") {
    const { from, to } = listWindow(gate.params, rows.length);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const statRows = await prisma.employee.findMany({
      where: scope,
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
          onboardingStatus: e.onboardingStatus as OnboardingStatus,
          companies: e.companies.map((c) => c.company.name),
        },
        employeeDecisions(
          { id: e.id, status: e.status, onboardingStatus: e.onboardingStatus as OnboardingStatus, hasOfferLetter: e.offerLetterKey !== null },
          {
            update: ctx.has(PERM.hr.employee.update),
            remove: ctx.has(PERM.hr.employee.delete),
            submit: ctx.has(PERM.hr.employee.submitOnboarding),
            accept: ctx.has(PERM.hr.employee.acceptOnboarding),
            reject: ctx.has(PERM.hr.employee.rejectOnboarding),
            offerLetter: ctx.has(PERM.hr.employee.offerLetter),
            setPin: ctx.has(PERM.hr.employee.setPin),
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
    company: company?.name ?? null,
  }) + (canIdentity ? "" : " · Identity numbers masked");

  return exportResponse({
    ...gate,
    screen,
    title: "Riders & Staff",
    entity: "Employee",
    filters,
    result: {
      columns: [
        { key: "code", header: "Rider ID" },
        { key: "name", header: "Name" },
        { key: "mobile", header: "Mobile" },
        { key: "altContact", header: "Alternate contact" },
        { key: "type", header: "Employment type" },
        { key: "designation", header: "Designation" },
        { key: "companies", header: "Companies" },
        { key: "onboarding", header: "Onboarding" },
        { key: "aadhaar", header: "Aadhaar" },
        { key: "pan", header: "PAN" },
        { key: "bank", header: "Bank" },
        { key: "address", header: "Address" },
        { key: "status", header: "Status" },
        { key: "joinedOn", header: "Joined on", format: "date" },
        { key: "leftOn", header: "Left on", format: "date" },
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
        companies: e.companies.map((c) => c.company.name).join(", "),
        onboarding: ONBOARDING_LABEL[e.onboardingStatus as OnboardingStatus],
        aadhaar: (canIdentity ? e.aadhaar : maskId(e.aadhaar)) ?? "",
        pan: (canIdentity ? e.pan : maskId(e.pan)) ?? "",
        bank: e.bankName ? `${e.bankName} · ${(canIdentity ? e.bankAccountNo : maskId(e.bankAccountNo)) ?? ""} · ${e.bankIfsc ?? ""}` : "",
        address: e.address ?? "",
        status: e.status === "INACTIVE" ? "Left" : "Active",
        joinedOn: e.joinedOn,
        leftOn: e.leftOn,
        documents: e._count.documents,
      })),
      summary: [{ label: "People", value: note }],
      emptyMessage: "Nobody matches these filters.",
    },
  });
}
