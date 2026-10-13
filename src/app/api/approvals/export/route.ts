import { capRows, exportGate, exportResponse } from "@/lib/exports/respond";
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
    format: gate.format,
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
      })),
      summary: [{ label: "Waiting", value: note }],
      emptyMessage: "Nothing is waiting on you.",
    },
  });
}
