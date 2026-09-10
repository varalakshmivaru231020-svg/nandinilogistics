import { ArrowLeftRight } from "lucide-react";

import { requirePermission } from "@/lib/rbac/guard";
import { projectScopeFilter } from "@/lib/rbac/context";
import { prisma } from "@/lib/db";
import { PERM } from "@/lib/permissions/codes";
import { issueLookups } from "./lookups";
import { NewIssueDrawer } from "./new-issue-drawer";
import { Card, EmptyState, PageHeader } from "@/components/ui/primitives";
import { IssuesScreen } from "./issues-screen";

export const metadata = { title: "Material Issues" };

export default async function IssuesPage() {
  const ctx = await requirePermission(PERM.material.issue.view);

  const lookups = ctx.has(PERM.material.issue.create) ? await issueLookups(ctx) : null;

  const issues = await prisma.materialIssue.findMany({
    where: projectScopeFilter(ctx),
    orderBy: { issueDate: "desc" },
    take: 100,
    include: {
      store: { select: { name: true } },
      project: { select: { code: true } },
      workPackage: { select: { code: true, name: true } },
      issuedBy: { select: { name: true } },
      items: { include: { item: { select: { name: true, uom: { select: { code: true } } } } } },
    },
  });

  // Who each slip went to — issuedToId is a plain field, so resolve the names.
  const recipientIds = [...new Set(issues.map((i) => i.issuedToId))];
  const recipients = await prisma.user.findMany({
    where: { id: { in: recipientIds } },
    select: { id: true, name: true },
  });
  const nameById = new Map(recipients.map((r) => [r.id, r.name]));

  const pendingAck = issues.filter((i) => !i.acknowledgedAt).length;

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        title="Material Issues"
        description="Store to supervisor, valued at the weighted-average rate and acknowledged by whoever receives it."
        actions={
          lookups ? (
            <NewIssueDrawer
              projects={lookups.projects}
              stores={lookups.stores}
              recipients={lookups.recipients}
              stock={lookups.stock}
              canViewValue={ctx.has(PERM.material.stock.viewValuation)}
            />
          ) : null
        }
      />

      {issues.length === 0 ? (
        <Card>
          <EmptyState
            icon={<ArrowLeftRight className="h-8 w-8" />}
            title="Nothing issued yet"
            description="Issuing material moves it out of the store ledger and onto a work package, so consumption can be compared with what was indented."
          />
        </Card>
      ) : (
        <IssuesScreen
          pendingAck={pendingAck}
          currentUserId={ctx.id}
          canAcknowledge={ctx.has(PERM.material.issue.acknowledge)}
          canViewValue={ctx.has(PERM.material.stock.viewValuation)}
          issues={issues.map((i) => ({
            id: i.id,
            issueNo: i.issueNo,
            issueDate: i.issueDate.toISOString(),
            projectCode: i.project.code,
            storeName: i.store.name,
            workPackage: i.workPackage ? `${i.workPackage.code} — ${i.workPackage.name}` : null,
            issuedByName: i.issuedBy.name,
            issuedToId: i.issuedToId,
            issuedToName: nameById.get(i.issuedToId) ?? "—",
            purpose: i.purpose,
            totalValue: Number(i.totalValue),
            acknowledgedAt: i.acknowledgedAt ? i.acknowledgedAt.toISOString() : null,
            lines: i.items.map((l) => ({
              id: l.id,
              name: l.item.name,
              uom: l.item.uom.code,
              issuedQty: Number(l.issuedQty),
              rate: Number(l.rate),
              value: Number(l.value),
            })),
          }))}
        />
      )}
    </div>
  );
}
