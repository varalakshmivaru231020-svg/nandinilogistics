import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChevronRight } from "lucide-react";

import { requirePermission } from "@/lib/rbac/guard";
import { prisma } from "@/lib/db";
import { PERM } from "@/lib/permissions/codes";
import { Badge, PageHeader } from "@/components/ui/primitives";
import { ReturnDetail } from "./return-detail";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const r = await prisma.materialReturn.findUnique({ where: { id }, select: { returnNo: true } });
  return { title: r?.returnNo ?? "Material Return" };
}

const TONE = { PENDING: "warn", APPROVED: "good", REJECTED: "bad" } as const;

export default async function ReturnDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requirePermission(PERM.material.return.view);

  const ret = await prisma.materialReturn.findUnique({
    where: { id },
    include: {
      project: { select: { code: true, name: true } },
      store: { select: { name: true } },
      issue: { select: { id: true, issueNo: true, cancelledAt: true } },
      raisedBy: { select: { name: true } },
      decidedBy: { select: { name: true } },
      items: {
        include: {
          item: { select: { code: true, name: true, uom: { select: { code: true } } } },
          issueItem: { select: { issuedQty: true, returnedQty: true } },
        },
      },
    },
  });
  if (!ret) notFound();

  if (!ctx.canAccessAllProjects && !ctx.projectIds.includes(ret.projectId)) {
    redirect(`/forbidden?code=${encodeURIComponent(PERM.project.project.accessAll)}`);
  }

  const pending = ret.status === "PENDING";

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title={ret.returnNo}
        description={`${ret.project.code} — ${ret.project.name} · into ${ret.store.name}`}
        breadcrumb={
          <span className="flex items-center gap-1">
            <Link href="/material/returns" className="hover:text-brand-600">Material Returns</Link>
            <ChevronRight className="h-3 w-3" />
            <span>{ret.returnNo}</span>
          </span>
        }
        actions={<Badge tone={TONE[ret.status]}>{ret.status}</Badge>}
      />

      <ReturnDetail
        ret={{
          id: ret.id,
          returnNo: ret.returnNo,
          status: ret.status,
          returnDate: ret.returnDate.toISOString(),
          reason: ret.reason,
          projectCode: ret.project.code,
          storeName: ret.store.name,
          issueNo: ret.issue.issueNo,
          issueCancelled: Boolean(ret.issue.cancelledAt),
          raisedByName: ret.raisedBy.name,
          decidedByName: ret.decidedBy?.name ?? null,
          decidedAt: ret.decidedAt?.toISOString() ?? null,
          decisionNote: ret.decisionNote,
          totalValue: Number(ret.totalValue),
        }}
        lines={ret.items.map((l) => ({
          id: l.id,
          code: l.item.code,
          name: l.item.name,
          uom: l.item.uom.code,
          quantity: Number(l.quantity),
          issuedQty: Number(l.issueItem.issuedQty),
          returnedQty: Number(l.issueItem.returnedQty),
          rate: Number(l.rate),
          value: Number(l.value),
          condition: l.condition,
          remarks: l.remarks,
        }))}
        can={{
          approve: pending && ctx.has(PERM.material.return.approve),
          // The raiser may delete their own pending return; anyone else needs delete.
          delete:
            pending &&
            (ctx.has(PERM.material.return.delete) ||
              (ctx.has(PERM.material.return.create) && ret.raisedById === ctx.id)),
          viewValuation: ctx.has(PERM.material.stock.viewValuation),
          viewIssues: ctx.has(PERM.material.issue.view),
        }}
      />
    </div>
  );
}
