import { prisma } from "@/lib/db";
import { capRows, exportGate, exportResponse, listWindow } from "@/lib/exports/respond";
import { indentFigures } from "@/lib/metrics/figures";
import { fulfilLines } from "@/lib/material/indent-lines";
import { bandOf, type ScreenShell } from "@/lib/screens/rows";
import { indentEmpty, INDENT_NOTE, indentScreenRow } from "@/lib/screens/rows/indent";
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
  const canPm = ctx.has(PERM.material.indent.approvePm);
  const canAdmin = ctx.has(PERM.material.indent.approveAdmin);

  const indents = await prisma.indent.findMany({
    where: indentListWhere(ctx, ownership, params),
    orderBy: { raisedAt: "desc" },
    include: {
      project: { select: { code: true, name: true } },
      raisedBy: { select: { name: true, designation: { select: { name: true } } } },
      workPackage: { select: { name: true } },
      _count: { select: { items: true } },
    },
  });
  const { rows, note } = capRows(indents);
  const asOfMs = new Date().getTime();

  /*
   * The screen, for the app: the same rows the web card draws, the band the web
   * opens with, and its empty state. Only the window travels, so the live stock
   * and issue figures behind a row's fulfilment are read for the fifty rows
   * being sent rather than for every indent that matched.
   */
  let screen: ScreenShell | undefined;
  if (gate.format === "json") {
    const { from, to } = listWindow(gate.params, rows.length);
    const window = rows.slice(from, to);
    const [items, statRows] = await Promise.all([
      prisma.indent.findMany({
        where: { id: { in: window.map((i) => i.id) } },
        select: {
          id: true,
          items: {
            select: {
              itemId: true, requestedQty: true, approvedQty: true,
              item: { select: { name: true, uom: { select: { name: true } } } },
            },
          },
        },
      }),
      // The band reads every indent in scope, whatever the filters say — as the
      // web screen's own second query does.
      prisma.indent.findMany({
        where: indentListWhere(ctx, ownership, {
          ...params, q: "", status: null, project: null, from: undefined, to: undefined,
        }),
        select: {
          status: true, estimatedValue: true, raisedAt: true,
          approvals: { select: { approvedAt: true }, orderBy: { approvedAt: "asc" }, take: 1 },
        },
      }),
    ]);
    const byId = new Map(items.map((i) => [i.id, i.items]));
    const lines = await fulfilLines(items);
    screen = {
      rows: window.map((i) => {
        const own = byId.get(i.id) ?? [];
        return indentScreenRow({
          id: i.id,
          indentNo: i.indentNo,
          project: i.project.name,
          raisedBy: i.raisedBy.designation
            ? `${i.raisedBy.name} · ${i.raisedBy.designation.name}`
            : i.raisedBy.name,
          raisedAt: i.raisedAt,
          requiredByDate: i.requiredByDate,
          activity: i.workPackage?.name ?? null,
          status: i.status,
          items: own,
          lineCount: i._count.items,
          lines: lines.get(i.id) ?? [],
        });
      }),
      band: bandOf(indentFigures(statRows)),
      empty: indentEmpty(
        Boolean(params.q || params.status || params.project || params.from || params.to),
        ctx.has(PERM.material.indent.create),
      ),
      note: INDENT_NOTE,
    };
  }

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
    params: gate.params,
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
        /*
         * How to settle it, where it is settleable — the same contract the
         * approvals queue uses. Not columns: the file does not want them, and
         * the alternative is the client reading a status string and deciding
         * for itself which level it is at, which is the one piece of knowledge
         * that must not be copied.
         */
        decide:
          i.status === "SUBMITTED" && canPm
            ? {
                approve: "material/indents/approveIndent",
                approveArgs: [i.id, "PM"],
                reject: "material/indents/rejectIndent",
                rejectArgs: [i.id],
                remarkRequired: false,
              }
            : i.status === "PM_APPROVED" && canAdmin
              ? {
                  approve: "material/indents/approveIndent",
                  approveArgs: [i.id, "ADMIN"],
                  reject: "material/indents/rejectIndent",
                  rejectArgs: [i.id],
                  remarkRequired: false,
                }
              : null,
        id: i.id,
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
    screen,
  });
}
