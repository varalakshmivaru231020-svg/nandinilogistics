import { prisma } from "@/lib/db";
import { capRows, exportGate, exportResponse } from "@/lib/exports/respond";
import {
  describeParts, issueListWhere, issueStateWords, rangeWords, readIssueListParams, searchWords,
} from "@/lib/material/list-filters";
import { projectLabel } from "@/lib/material/list-options";
import { PERM } from "@/lib/permissions/codes";
import type { ReportColumn } from "@/lib/reports/types";

export const dynamic = "force-dynamic";

/**
 * Every issue slip matching the screen's filters, within the caller's project
 * scope. The value column appears only for someone who may see valuation — the
 * screen shows a line count in its place.
 */
export async function GET(request: Request) {
  const gate = await exportGate(request, PERM.material.issue.view, PERM.material.issue.export);
  if (!gate.ok) return gate.response;
  const { ctx } = gate;
  const params = readIssueListParams(gate.params);
  const showValue = ctx.has(PERM.material.stock.viewValuation);

  const issues = await prisma.materialIssue.findMany({
    where: issueListWhere(ctx, params),
    orderBy: { issueDate: "desc" },
    include: {
      store: { select: { name: true } },
      project: { select: { code: true } },
      workPackage: { select: { code: true, name: true } },
      issuedBy: { select: { name: true } },
      _count: { select: { items: true } },
    },
  });
  const { rows, note } = capRows(issues);

  const recipients = await prisma.user.findMany({
    where: { id: { in: [...new Set(rows.map((i) => i.issuedToId))] } },
    select: { id: true, name: true },
  });
  const nameById = new Map(recipients.map((r) => [r.id, r.name]));

  const filters = describeParts(
    [
      searchWords(params.q),
      await projectLabel(params.project),
      params.ack === "pending" ? "Awaiting acknowledgement" : params.ack === "acknowledged" ? "Acknowledged" : null,
      issueStateWords(params.status),
      rangeWords("Issued", params),
    ],
    "All issue slips in view",
  );

  const columns: ReportColumn[] = [
    { key: "issueNo", header: "Issue No" },
    { key: "issueDate", header: "Issued on", format: "date" },
    { key: "project", header: "Project" },
    { key: "store", header: "Store" },
    { key: "workPackage", header: "Work package" },
    { key: "issuedBy", header: "Issued by" },
    { key: "issuedTo", header: "Issued to" },
    { key: "purpose", header: "Purpose" },
    { key: "lines", header: "Lines", align: "right", format: "number" },
    ...(showValue ? [{ key: "value", header: "Value", align: "right", format: "money" } satisfies ReportColumn] : []),
    { key: "acknowledgedAt", header: "Acknowledged on", format: "date" },
    { key: "status", header: "Status" },
    { key: "cancelledAt", header: "Cancelled on", format: "date" },
    { key: "cancelReason", header: "Cancel reason" },
  ];

  return exportResponse({
    ctx,
    params: gate.params,
    format: gate.format,
    title: "Material Issues",
    entity: "MaterialIssue",
    filters,
    result: {
      columns,
      rows: rows.map((i) => ({
        id: i.id,
        issueNo: i.issueNo,
        issueDate: i.issueDate,
        project: i.project.code,
        store: i.store.name,
        workPackage: i.workPackage ? `${i.workPackage.code} — ${i.workPackage.name}` : "",
        issuedBy: i.issuedBy.name,
        issuedTo: nameById.get(i.issuedToId) ?? "",
        purpose: i.purpose ?? "",
        lines: i._count.items,
        ...(showValue ? { value: Number(i.totalValue) } : {}),
        acknowledgedAt: i.acknowledgedAt,
        status: i.cancelledAt ? "Cancelled" : "Active",
        cancelledAt: i.cancelledAt,
        cancelReason: i.cancelReason ?? "",
      })),
      summary: [{ label: "Issue slips", value: note }],
      emptyMessage: "No issue slips match these filters.",
    },
  });
}
