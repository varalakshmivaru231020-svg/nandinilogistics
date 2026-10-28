import { requirePermission } from "@/lib/rbac/guard";
import { prisma } from "@/lib/db";
import { PERM } from "@/lib/permissions/codes";
import { decisionHistory, filterInbox, loadInbox, readInboxParams } from "@/lib/approvals/inbox";
import { cn, formatDateTime } from "@/lib/utils";
import { APPROVAL_KIND_LABEL, APPROVAL_KINDS } from "@/lib/approvals/rule";
import { ListToolbar } from "@/components/list/list-toolbar";
import { PageHeader } from "@/components/ui/primitives";
import { ExportMenu, exportHref } from "@/components/export/export-menu";
import { ApprovalsList } from "./approvals-list";

export const metadata = { title: "Approvals" };

/**
 * One inbox for everything waiting on a Team Leader or Super Admin: leads and
 * referrals a tele-caller raised, onboarding forms, advance requests and
 * profile changes, new rider and staff records, and edits, deletions and
 * status changes held for approval. The rule is in lib/approvals/rule.ts:
 * a tele-caller's work goes to a Team Leader or Super Admin, a Team Leader's
 * to Super Admin. Below the list, what was decided lately and by whom.
 */
export default async function ApprovalsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; type?: string; raisedBy?: string }>;
}) {
  const ctx = await requirePermission(PERM.approvals.queue.view);
  const raw = await searchParams;
  const params = readInboxParams(raw);
  const nowMs = new Date().getTime();

  const [all, history] = await Promise.all([
    loadInbox(prisma, ctx),
    decisionHistory(prisma, ctx, nowMs - 14 * 86_400_000),
  ]);
  const rows = filterInbox(all, params);
  const raisers = [...new Set(all.map((r) => r.raisedBy).filter((n) => n !== "—"))].sort();

  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(raw)) if (v) sp.set(k, String(v));

  return (
    <div className="animate-fade-up">
      <PageHeader
        title="Approvals"
        description="What a tele-caller does waits for a Team Leader or Super Admin — whichever approves first. What a Team Leader does waits for Super Admin. A reason is mandatory on reject."
        actions={<ExportMenu href={(format) => exportHref("/api/approvals/export", format, sp)} />}
      />
      <ListToolbar
        searchPlaceholder="Search what is waiting…"
        filters={[
          {
            name: "type", label: "Type", allLabel: "Everything",
            options: APPROVAL_KINDS.map((k) => ({ value: k, label: APPROVAL_KIND_LABEL[k] })),
          },
          {
            name: "raisedBy", label: "Raised by", allLabel: "Anyone",
            options: raisers.map((n) => ({ value: n, label: n })),
          },
        ]}
        count={rows.length}
        countNoun="waiting"
      />
      <ApprovalsList rows={rows} nowMs={nowMs} canDecide={ctx.has(PERM.approvals.queue.decide)} />

      <h2 className="mb-2.5 mt-8 font-display text-[15px] font-bold text-navy-950">Recently decided</h2>
      <p className="mb-3 text-[12px] font-medium text-muted-500">The last 14 days — who approved or rejected what.</p>
      <div className="overflow-x-auto rounded-[13px] border border-line-400 bg-white">
        <table className="w-full min-w-[640px] border-collapse">
          <thead>
            <tr>
              {["When", "Decision", "What", "Decided by"].map((h) => (
                <th key={h} className="border-b border-line-150 bg-surface-sunken px-4 py-3 text-left text-[10.5px] font-bold uppercase tracking-[.08em] text-muted-400">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {history.map((h) => (
              <tr key={h.id}>
                <td className="num border-b border-line-150 px-4 py-2.5 text-[12px] font-medium text-muted-600">{formatDateTime(new Date(h.atMs))}</td>
                <td className="border-b border-line-150 px-4 py-2.5">
                  <span className={cn("rounded-full px-2 py-[3px] text-[10.5px] font-bold", h.decision === "APPROVED" ? "bg-good-050 text-good-700" : "bg-[#FCEDED] text-[#B23334]")}>
                    {h.decision === "APPROVED" ? "Approved" : "Rejected"}
                  </span>
                </td>
                <td className="border-b border-line-150 px-4 py-2.5 text-[12.5px] font-medium text-navy-800">{h.what}</td>
                <td className="border-b border-line-150 px-4 py-2.5 text-[12.5px] font-semibold text-navy-700">{h.by}</td>
              </tr>
            ))}
            {history.length === 0 && (
              <tr><td colSpan={4} className="px-5 py-8 text-center text-[12.5px] font-medium text-muted-400">Nothing decided in the last 14 days.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
