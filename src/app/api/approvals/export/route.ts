import { capRows, exportGate, exportResponse, listWindow } from "@/lib/exports/respond";
import { type ScreenShell } from "@/lib/screens/rows";
import { approvalEmpty, approvalScreenRow } from "@/lib/screens/rows/exec";
import { loadApprovalQueue } from "@/lib/approvals/service";
import { KIND_LABEL, waitingFor } from "@/lib/approvals/queue";
import { PERM } from "@/lib/permissions/codes";
import type { ReportColumn } from "@/lib/reports/types";

export const dynamic = "force-dynamic";

/**
 * Everything waiting on this person, oldest first.
 *
 * The same queue the screen draws — `loadApprovalQueue` is shared, so a row
 * that is hidden on screen is absent here, and one that cannot be decided says
 * so. `canDecide` travels with the row because the queue is deliberately wider
 * than what a person may act on: a Store Manager sees an indent waiting on the
 * Owner and knows it is moving, without being offered the button.
 */
export async function GET(request: Request) {
  const gate = await exportGate(request, PERM.approvals.queue.view, PERM.approvals.queue.export);
  if (!gate.ok) return gate.response;
  const { ctx } = gate;

  const queue = await loadApprovalQueue(ctx);
  const { rows, note } = capRows(queue);
  const nowMs = Date.now();

  /* The screen, for the app: the queue row the web draws — what it is, which
   * document, who raised it, what it is worth and how long it has waited. */
  let screen: ScreenShell | undefined;
  if (gate.format === "json") {
    const { from, to } = listWindow(gate.params, rows.length);
    screen = {
      rows: rows.slice(from, to).map((r) =>
        approvalScreenRow({
          id: r.id,
          kind: r.kind,
          kindLabel: KIND_LABEL[r.kind],
          reference: r.reference,
          title: r.title,
          raisedBy: r.raisedBy,
          projectName: r.projectName,
          value: r.value,
          waitingOn: r.waitingOn,
          waitingFor: waitingFor(r.raisedAt, nowMs),
          decide: r.canDecide ? r.decide : null,
        }),
      ),
      empty: approvalEmpty(false),
    };
  }

  const columns: ReportColumn[] = [
    { key: "reference", header: "Reference" },
    { key: "kind", header: "Kind" },
    { key: "title", header: "What" },
    { key: "project", header: "Project" },
    { key: "raisedBy", header: "Raised by" },
    { key: "raisedAt", header: "Raised", format: "date" },
    { key: "waiting", header: "Waiting" },
    { key: "waitingOn", header: "Waiting on" },
    { key: "value", header: "Value", align: "right", format: "money" },
    { key: "yours", header: "Yours to decide" },
  ];

  return exportResponse({
    ctx,
    params: gate.params,
    format: gate.format,
    screen,
    title: "Approvals",
    entity: "Approval",
    filters: "Everything waiting on a decision, oldest first",
    result: {
      columns,
      rows: rows.map((r) => ({
        reference: r.reference,
        kind: KIND_LABEL[r.kind] ?? r.kind,
        title: r.title,
        project: r.projectName ?? "",
        raisedBy: r.raisedBy,
        raisedAt: r.raisedAt,
        waiting: waitingFor(r.raisedAt, nowMs),
        waitingOn: r.waitingOn,
        value: r.value ?? null,
        yours: r.canDecide ? "Yes" : "No",
        href: r.href,
        id: r.id,
        /*
         * Not columns — the client needs them and a file does not. The CSV and
         * the PDF are built from `columns`, so these ride along without
         * appearing in either.
         */
        canDecide: r.canDecide,
        decide: r.decide,
      })),
      summary: [{ label: "Waiting", value: note }],
      emptyMessage: "Nothing is waiting on you.",
    },
  });
}
