import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChevronRight } from "lucide-react";

import { requirePermission } from "@/lib/rbac/guard";
import { prisma } from "@/lib/db";
import { PERM } from "@/lib/permissions/codes";
import { isIndentEditable, mayEditIndentAs } from "@/lib/material/procurement";
import { Badge, PageHeader } from "@/components/ui/primitives";
import { IndentDetail } from "./indent-detail";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const i = await prisma.indent.findUnique({ where: { id }, select: { indentNo: true } });
  return { title: i?.indentNo ?? "Indent" };
}

export default async function IndentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requirePermission(PERM.material.indent.view);

  const indent = await prisma.indent.findUnique({
    where: { id },
    include: {
      project: { select: { id: true, code: true, name: true } },
      workPackage: { select: { code: true, name: true } },
      raisedBy: { select: { name: true, email: true } },
      items: { include: { item: { select: { code: true, name: true, uom: { select: { code: true } } } } } },
      approvals: {
        orderBy: { approvedAt: "asc" },
        include: { approvedBy: { select: { name: true } } },
      },
    },
  });
  if (!indent) notFound();

  if (!ctx.canAccessAllProjects && !ctx.projectIds.includes(indent.projectId)) {
    redirect(`/forbidden?code=${encodeURIComponent(PERM.project.project.accessAll)}`);
  }
  if (indent.raisedById !== ctx.id && !ctx.has(PERM.material.indent.viewAll)) {
    redirect(`/forbidden?code=${encodeURIComponent(PERM.material.indent.viewAll)}`);
  }

  // Live on-hand quantity, so the stock check result can be shown in context.
  const balances = await prisma.stockBalance.groupBy({
    by: ["itemId"],
    where: { itemId: { in: indent.items.map((i) => i.itemId) } },
    _sum: { quantity: true },
  });
  const onHand = Object.fromEntries(balances.map((b) => [b.itemId, Number(b._sum.quantity ?? 0)]));

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title={indent.indentNo}
        description={`${indent.project.code} · raised by ${indent.raisedBy.name}${indent.purpose ? ` · ${indent.purpose}` : ""}`}
        breadcrumb={
          <span className="flex items-center gap-1">
            <Link href="/material/indents" className="hover:text-brand-600">Indents</Link>
            <ChevronRight className="h-3 w-3" />
            <span>{indent.indentNo}</span>
          </span>
        }
        actions={<Badge tone="slate">{indent.status.replace(/_/g, " ")}</Badge>}
      />

      <IndentDetail
        indent={{
          id: indent.id,
          indentNo: indent.indentNo,
          status: indent.status,
          updatedAt: indent.updatedAt.toISOString(),
          raisedAt: indent.raisedAt.toISOString(),
          requiredByDate: indent.requiredByDate.toISOString(),
          purpose: indent.purpose,
          remarks: indent.remarks,
          estimatedValue: Number(indent.estimatedValue),
          raisedById: indent.raisedById,
          projectName: indent.project.name,
          projectCode: indent.project.code,
          workPackage: indent.workPackage ? `${indent.workPackage.code} — ${indent.workPackage.name}` : null,
          raisedByName: indent.raisedBy.name,
        }}
        items={indent.items.map((i) => ({
          id: i.id,
          itemId: i.itemId,
          code: i.item.code,
          name: i.item.name,
          uom: i.item.uom.code,
          requestedQty: Number(i.requestedQty),
          approvedQty: i.approvedQty === null ? null : Number(i.approvedQty),
          issueFromStockQty: Number(i.issueFromStockQty),
          toPurchaseQty: Number(i.toPurchaseQty),
          estimatedRate: Number(i.estimatedRate),
          specification: i.specification,
          onHand: onHand[i.itemId] ?? 0,
        }))}
        approvals={indent.approvals.map((a) => ({
          id: a.id,
          level: a.level,
          decision: a.decision,
          approverName: a.approvedBy.name,
          approvedAt: a.approvedAt.toISOString(),
          remarks: a.remarks,
          changes: a.changes as Record<string, { from: unknown; to: unknown }> | null,
        }))}
        can={{
          submit: ctx.has(PERM.material.indent.submit),
          approvePm: ctx.has(PERM.material.indent.approvePm),
          approveAdmin: ctx.has(PERM.material.indent.approveAdmin),
          reject: ctx.has(PERM.material.indent.reject),
          reviseQty: ctx.has(PERM.material.indent.reviseQty),
          cancel: ctx.has(PERM.material.indent.cancel),
          stockCheck: ctx.has(PERM.material.indent.stockCheck),
          tabItems: ctx.has(PERM.material.indent.tabItems),
          tabApprovals: ctx.has(PERM.material.indent.tabApprovals),
          update:
            ctx.has(PERM.material.indent.update) &&
            mayEditIndentAs(indent, { id: ctx.id, hasViewAll: ctx.has(PERM.material.indent.viewAll) }),
        }}
        editable={isIndentEditable({ status: indent.status, approvalCount: indent.approvals.length })}
        currentUserId={ctx.id}
        approvalCeiling={ctx.approvalLimitFor("material.indent")}
      />
    </div>
  );
}
