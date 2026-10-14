import { prisma } from "@/lib/db";
import { capRows, exportGate, exportResponse } from "@/lib/exports/respond";
import {
  describeParts, enumWords, rangeWords, readReturnListParams, returnListWhere, searchWords,
} from "@/lib/material/list-filters";
import { projectLabel } from "@/lib/material/list-options";
import { PERM } from "@/lib/permissions/codes";
import type { ReportColumn } from "@/lib/reports/types";

export const dynamic = "force-dynamic";

/**
 * Every material return matching the screen's filters, within the caller's
 * project scope. The value column appears only for someone who may see
 * valuation, as on screen.
 */
export async function GET(request: Request) {
  const gate = await exportGate(request, PERM.material.return.view, PERM.material.return.export);
  if (!gate.ok) return gate.response;
  const { ctx } = gate;
  const params = readReturnListParams(gate.params);
  const showValue = ctx.has(PERM.material.stock.viewValuation);

  const returns = await prisma.materialReturn.findMany({
    where: returnListWhere(ctx, params),
    orderBy: { returnDate: "desc" },
    include: {
      project: { select: { code: true } },
      store: { select: { name: true } },
      issue: { select: { issueNo: true } },
      raisedBy: { select: { name: true } },
      decidedBy: { select: { name: true } },
      items: { select: { condition: true } },
    },
  });
  const { rows, note } = capRows(returns);

  const filters = describeParts(
    [
      searchWords(params.q),
      enumWords("Status", params.status),
      await projectLabel(params.project),
      rangeWords("Returned", params),
    ],
    "All material returns in view",
  );

  const columns: ReportColumn[] = [
    { key: "returnNo", header: "Return No" },
    { key: "returnDate", header: "Returned on", format: "date" },
    { key: "project", header: "Project" },
    { key: "store", header: "Store" },
    { key: "issueNo", header: "Against issue" },
    { key: "raisedBy", header: "Raised by" },
    { key: "reason", header: "Reason" },
    { key: "lines", header: "Lines", align: "right", format: "number" },
    { key: "damaged", header: "Damaged lines", align: "right", format: "number" },
    ...(showValue ? [{ key: "value", header: "Value", align: "right", format: "money" } satisfies ReportColumn] : []),
    { key: "status", header: "Status" },
    { key: "decidedBy", header: "Decided by" },
    { key: "decidedAt", header: "Decided on", format: "date" },
    { key: "decisionNote", header: "Decision note" },
  ];

  return exportResponse({
    ctx,
    format: gate.format,
    title: "Material Returns",
    entity: "MaterialReturn",
    filters,
    result: {
      columns,
      rows: rows.map((r) => ({
        id: r.id,
        returnNo: r.returnNo,
        returnDate: r.returnDate,
        project: r.project.code,
        store: r.store.name,
        issueNo: r.issue.issueNo,
        raisedBy: r.raisedBy.name,
        reason: r.reason ?? "",
        lines: r.items.length,
        damaged: r.items.filter((i) => i.condition === "Damaged").length,
        ...(showValue ? { value: Number(r.totalValue) } : {}),
        status: r.status,
        decidedBy: r.decidedBy?.name ?? "",
        decidedAt: r.decidedAt,
        decisionNote: r.decisionNote ?? "",
      })),
      summary: [{ label: "Returns", value: note }],
      emptyMessage: "No material returns match these filters.",
    },
  });
}
