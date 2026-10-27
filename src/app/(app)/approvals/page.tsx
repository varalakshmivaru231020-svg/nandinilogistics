import { requirePermission } from "@/lib/rbac/guard";
import { prisma } from "@/lib/db";
import { PERM } from "@/lib/permissions/codes";
import { filterInbox, loadInbox, readInboxParams } from "@/lib/approvals/inbox";
import { APPROVAL_KIND_LABEL, APPROVAL_KINDS } from "@/lib/approvals/rule";
import { ListToolbar } from "@/components/list/list-toolbar";
import { PageHeader } from "@/components/ui/primitives";
import { ExportMenu, exportHref } from "@/components/export/export-menu";
import { ApprovalsList } from "./approvals-list";

export const metadata = { title: "Approvals" };

/**
 * One inbox for everything waiting on a Team Leader or Super Admin: leads and
 * referrals a tele-caller raised, onboarding forms, advance requests and
 * profile changes. The fixed rule is in lib/approvals/rule.ts.
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

  const all = await loadInbox(prisma, ctx);
  const rows = filterInbox(all, params);
  const raisers = [...new Set(all.map((r) => r.raisedBy).filter((n) => n !== "—"))].sort();

  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(raw)) if (v) sp.set(k, String(v));

  return (
    <div className="animate-fade-up">
      <PageHeader
        title="Approvals"
        description="Anything a tele-caller raises waits here until a Team Leader or Super Admin approves or rejects it. A reason is mandatory on reject."
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
    </div>
  );
}
