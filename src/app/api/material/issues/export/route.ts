import { prisma } from "@/lib/db";
import { capRows, exportGate, exportResponse, listWindow } from "@/lib/exports/respond";
import { type ScreenShell } from "@/lib/screens/rows";
import { issueEmpty, issueScreenRow } from "@/lib/screens/rows/issue";
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

  /*
   * The screen, for the app: the slip card with its badges. What has come back
   * and how many returns are pending are read for the window being sent. The
   * screen has no band — the web counts the slips in its toolbar instead.
   */
  let screen: ScreenShell | undefined;
  if (gate.format === "json") {
    const { from, to } = listWindow(gate.params, rows.length);
    const window = rows.slice(from, to);
    const extra = await prisma.materialIssue.findMany({
      where: { id: { in: window.map((i) => i.id) } },
      select: {
        id: true, totalValue: true,
        items: { select: { returnedQty: true } },
        _count: { select: { returns: true } },
      },
    });
    const byId = new Map(extra.map((i) => [i.id, i]));
    screen = {
      rows: window.map((i) => {
        const e = byId.get(i.id);
        return issueScreenRow(
          {
            id: i.id,
            issueNo: i.issueNo,
            projectCode: i.project.code,
            storeName: i.store.name,
            issuedToName: nameById.get(i.issuedToId) ?? "—",
            issuedByName: i.issuedBy.name,
            issueDate: i.issueDate,
            workPackage: i.workPackage ? `${i.workPackage.code} — ${i.workPackage.name}` : null,
            purpose: i.purpose,
            totalValue: Number(e?.totalValue ?? 0),
            lineCount: i._count.items,
            returnedQty: (e?.items ?? []).reduce((n, l) => n + Number(l.returnedQty), 0),
            pendingReturns: e?._count.returns ?? 0,
            acknowledgedAt: i.acknowledgedAt,
            cancelledAt: i.cancelledAt,
          },
          showValue,
        );
      }),
      empty: issueEmpty(
        Boolean(params.q || params.project || params.ack || params.status || params.from || params.to),
      ),
    };
  }

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
    screen,
  });
}
