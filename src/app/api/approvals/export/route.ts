import { prisma } from "@/lib/db";
import { capRows, exportGate, exportResponse, listWindow } from "@/lib/exports/respond";
import type { ScreenShell } from "@/lib/screens/rows";
import { describeInboxFilters, filterInbox, loadInbox, readInboxParams } from "@/lib/approvals/inbox";
import { APPROVAL_KIND_LABEL, waitingLabel } from "@/lib/approvals/rule";
import { PERM } from "@/lib/permissions/codes";
import { formatDateTime } from "@/lib/utils";

export const dynamic = "force-dynamic";

/** The Approvals inbox as a file, and as the app's list — the screen's own filter. */
export async function GET(request: Request) {
  const gate = await exportGate(request, PERM.approvals.queue.view);
  if (!gate.ok) return gate.response;
  const { ctx, params } = gate;

  const p = readInboxParams(params);
  const nowMs = Date.now();
  const matching = filterInbox(await loadInbox(prisma, ctx), p);
  const { rows, note } = capRows(matching);

  let screen: ScreenShell | undefined;
  if (gate.format === "json") {
    const { from, to } = listWindow(gate.params, rows.length);
    screen = {
      rows: rows.slice(from, to).map((r) => ({
        id: r.id,
        title: r.what,
        meta: `${APPROVAL_KIND_LABEL[r.kind]} · raised by ${r.raisedBy}`,
        lines: [
          { label: "When", value: formatDateTime(new Date(r.raisedAtMs)) },
          { label: "Waiting", value: waitingLabel(r.raisedAtMs, nowMs) },
        ],
        status: { label: "Pending approval", tone: "warn" as const },
      })),
      empty: { title: "Nothing is waiting for approval." },
    };
  }

  return exportResponse({
    ...gate,
    screen,
    title: "Approvals",
    entity: "Approval",
    filters: describeInboxFilters(p),
    result: {
      columns: [
        { key: "type", header: "Type" },
        { key: "what", header: "What" },
        { key: "raisedBy", header: "Raised by" },
        { key: "raisedAt", header: "When", format: "date" },
        { key: "waiting", header: "Waiting" },
      ],
      rows: rows.map((r) => ({
        id: r.id,
        type: APPROVAL_KIND_LABEL[r.kind],
        what: r.what,
        raisedBy: r.raisedBy,
        raisedAt: new Date(r.raisedAtMs),
        waiting: waitingLabel(r.raisedAtMs, nowMs),
      })),
      summary: [{ label: "Waiting", value: note }],
      emptyMessage: "Nothing is waiting for approval.",
    },
  });
}
