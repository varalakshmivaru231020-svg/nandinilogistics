import { prisma } from "@/lib/db";
import { capRows, exportGate, exportResponse } from "@/lib/exports/respond";
import {
  describeParts, enumWords, indentListWhere, rangeWords, readIndentListParams, searchWords,
} from "@/lib/material/list-filters";
import { projectLabel } from "@/lib/material/list-options";
import { PERM } from "@/lib/permissions/codes";
import type { ReportColumn } from "@/lib/reports/types";

export const dynamic = "force-dynamic";

/**
 * Every indent matching the screen's filters — not just the page on display —
 * within the caller's project scope, and only their own indents unless they
 * hold viewAll. Waiting days appear only for someone who may see ageing.
 */
export async function GET(request: Request) {
  const gate = await exportGate(request, PERM.material.indent.view, PERM.material.indent.export);
  if (!gate.ok) return gate.response;
  const { ctx } = gate;
  const params = readIndentListParams(gate.params);
  const ownership = ctx.has(PERM.material.indent.viewAll) ? {} : { raisedById: ctx.id };
  const showAgeing = ctx.has(PERM.material.indent.viewAgeing);

  const indents = await prisma.indent.findMany({
    where: indentListWhere(ctx, ownership, params),
    orderBy: { raisedAt: "desc" },
    include: {
      project: { select: { code: true } },
      raisedBy: { select: { name: true } },
      workPackage: { select: { name: true } },
      _count: { select: { items: true } },
    },
  });
  const { rows, note } = capRows(indents);
  const asOfMs = new Date().getTime();

  const filters = describeParts(
    [
      searchWords(params.q),
      enumWords("Status", params.status),
      await projectLabel(params.project),
      rangeWords("Raised", params),
      ownership.raisedById ? "Your indents" : null,
    ],
    "All indents in view",
  );

  const columns: ReportColumn[] = [
    { key: "indentNo", header: "Indent No" },
    { key: "project", header: "Project" },
    { key: "purpose", header: "Purpose" },
    { key: "activity", header: "Activity" },
    { key: "raisedBy", header: "Raised by" },
    { key: "raisedAt", header: "Raised on", format: "date" },
    { key: "requiredBy", header: "Required by", format: "date" },
    { key: "lines", header: "Lines", align: "right", format: "number" },
    { key: "status", header: "Status" },
    ...(showAgeing
      ? [{ key: "waitingDays", header: "Waiting (days)", align: "right", format: "number" } satisfies ReportColumn]
      : []),
  ];

  return exportResponse({
    ctx,
    format: gate.format,
    title: "Indents",
    entity: "Indent",
    filters,
    result: {
      columns,
      rows: rows.map((i) => ({
        indentNo: i.indentNo,
        project: i.project.code,
        purpose: i.purpose ?? "",
        activity: i.workPackage?.name ?? "",
        raisedBy: i.raisedBy.name,
        raisedAt: i.raisedAt,
        requiredBy: i.requiredByDate,
        lines: i._count.items,
        status: i.status.replace(/_/g, " "),
        ...(showAgeing
          ? {
              waitingDays: ["SUBMITTED", "PM_APPROVED"].includes(i.status)
                ? Math.floor((asOfMs - i.raisedAt.getTime()) / 86_400_000)
                : null,
            }
          : {}),
      })),
      summary: [{ label: "Indents", value: note }],
      emptyMessage: "No indents match these filters.",
    },
  });
}
