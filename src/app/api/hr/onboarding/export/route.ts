import { prisma } from "@/lib/db";
import { capRows, EXPORT_MAX_ROWS, exportGate, exportResponse, listWindow } from "@/lib/exports/respond";
import type { ScreenShell } from "@/lib/screens/rows";
import { employeeDecisions } from "@/lib/records/employee";
import { onboardingScreenRow } from "@/lib/screens/rows/hr";
import { describeOnboardingFilters, employeeScope, onboardingWhere, readOnboardingParams } from "@/lib/hr/list-filters";
import { ONBOARDING_LABEL, ONBOARDING_STATUSES, type OnboardingStatus } from "@/lib/riders/onboarding";
import { PERM } from "@/lib/permissions/codes";
import { formatDateTime } from "@/lib/utils";

export const dynamic = "force-dynamic";

/**
 * Exports the onboarding queue — the forms in the viewer's scope at the
 * chosen status (Submitted, by default), as the /hr/onboarding screen lists
 * them. In its JSON mode the statuses travel as tabs, with counts, so a phone
 * shows the queue one state at a time.
 */
export async function GET(request: Request) {
  const gate = await exportGate(request, PERM.hr.employee.view, PERM.hr.employee.export);
  if (!gate.ok) return gate.response;
  const { ctx, params } = gate;

  const listParams = readOnboardingParams(params);
  const scope = employeeScope(ctx);

  const [forms, counts, company] = await Promise.all([
    prisma.employee.findMany({
      where: { AND: [scope, onboardingWhere(listParams)] },
      orderBy: [{ submittedAt: "desc" }, { createdAt: "desc" }],
      take: EXPORT_MAX_ROWS + 1,
      select: {
        id: true, employeeCode: true, name: true, mobile: true, status: true, onboardingStatus: true,
        submittedAt: true, decidedAt: true, rejectionReason: true, offerLetterKey: true,
        employmentType: { select: { name: true } },
        companies: { select: { company: { select: { name: true } } } },
        decidedBy: { select: { name: true } },
        lead: { select: { leadNo: true } },
      },
    }),
    prisma.employee.groupBy({
      by: ["onboardingStatus"],
      where: { AND: [scope, onboardingWhere({ ...listParams, status: "" })] },
      _count: { _all: true },
    }),
    listParams.company
      ? prisma.company.findUnique({ where: { id: listParams.company }, select: { name: true } })
      : null,
  ]);
  const { rows, note } = capRows(forms);

  let screen: ScreenShell | undefined;
  if (gate.format === "json") {
    const { from, to } = listWindow(gate.params, rows.length);
    const held = new Map(counts.map((c) => [c.onboardingStatus as string, c._count._all]));
    const can = {
      update: ctx.has(PERM.hr.employee.update),
      remove: ctx.has(PERM.hr.employee.delete),
      submit: ctx.has(PERM.hr.employee.submitOnboarding),
      accept: ctx.has(PERM.hr.employee.acceptOnboarding),
      reject: ctx.has(PERM.hr.employee.rejectOnboarding),
      offerLetter: ctx.has(PERM.hr.employee.offerLetter),
      setPin: ctx.has(PERM.hr.employee.setPin),
    };
    screen = {
      rows: rows.slice(from, to).map((e) =>
        onboardingScreenRow(
          {
            id: e.id,
            name: e.name,
            code: e.employeeCode,
            mobile: e.mobile,
            employmentType: e.employmentType.name,
            companies: e.companies.map((c) => c.company.name),
            onboardingStatus: e.onboardingStatus as OnboardingStatus,
            submittedAt: e.submittedAt ? formatDateTime(e.submittedAt) : null,
            decidedAt: e.decidedAt ? formatDateTime(e.decidedAt) : null,
            decidedBy: e.decidedBy?.name ?? null,
            leadNo: e.lead?.leadNo ?? null,
          },
          employeeDecisions(
            { id: e.id, status: e.status, onboardingStatus: e.onboardingStatus as OnboardingStatus, hasOfferLetter: e.offerLetterKey !== null },
            can,
          ),
        ),
      ),
      empty: { title: "Nothing waiting right now." },
      tabs: {
        param: "status",
        options: [
          { key: "all", label: "All", count: counts.reduce((s, c) => s + c._count._all, 0) },
          ...ONBOARDING_STATUSES.map((s) => ({ key: s, label: ONBOARDING_LABEL[s], count: held.get(s) ?? 0 })),
        ],
      },
    };
  }

  return exportResponse({
    ...gate,
    screen,
    title: "Onboarding",
    entity: "Employee",
    filters: describeOnboardingFilters(listParams, company?.name ?? null),
    result: {
      columns: [
        { key: "code", header: "Rider ID" },
        { key: "name", header: "Name" },
        { key: "mobile", header: "Mobile" },
        { key: "type", header: "Employment type" },
        { key: "companies", header: "Companies" },
        { key: "status", header: "Onboarding" },
        { key: "submittedAt", header: "Submitted", format: "date" },
        { key: "decidedAt", header: "Decided", format: "date" },
        { key: "decidedBy", header: "Decided by" },
        { key: "reason", header: "Rejection reason" },
        { key: "lead", header: "From lead" },
      ],
      rows: rows.map((e) => ({
        id: e.id,
        code: e.employeeCode,
        name: e.name,
        mobile: e.mobile,
        type: e.employmentType.name,
        companies: e.companies.map((c) => c.company.name).join(", "),
        status: ONBOARDING_LABEL[e.onboardingStatus as OnboardingStatus],
        submittedAt: e.submittedAt,
        decidedAt: e.decidedAt,
        decidedBy: e.decidedBy?.name ?? "",
        reason: e.rejectionReason ?? "",
        lead: e.lead?.leadNo ?? "",
      })),
      summary: [{ label: "Forms", value: note }],
      emptyMessage: "No onboarding forms match these filters.",
    },
  });
}
