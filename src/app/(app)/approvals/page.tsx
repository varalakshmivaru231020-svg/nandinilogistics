import { requirePermission } from "@/lib/rbac/guard";
import { PERM } from "@/lib/permissions/codes";
import { PageHeader } from "@/components/ui/primitives";
import { loadApprovalQueue } from "@/lib/approvals/service";
import { ApprovalsScreen } from "./approvals-screen";

export const metadata = { title: "Approvals" };

/**
 * Everything waiting for a decision. The queue itself is
 * `src/lib/approvals/service.ts`, so the screen, its export and the Android
 * client all read the same one.
 */
export default async function ApprovalsPage() {
  const ctx = await requirePermission(PERM.approvals.queue.view);
  const rows = await loadApprovalQueue(ctx);

  return (
    <div className="animate-fade-up">
      <PageHeader
        title="Approvals"
        description="Everything waiting on a decision, oldest first — indents, purchase orders, invoices, returns, transfers, schedule extensions and every task decision in one place."
      />
      <ApprovalsScreen rows={rows} nowMs={new Date().getTime()} />
    </div>
  );
}
