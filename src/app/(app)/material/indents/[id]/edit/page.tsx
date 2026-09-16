import { notFound, redirect } from "next/navigation";

import { requirePermission } from "@/lib/rbac/guard";
import { prisma } from "@/lib/db";
import { PERM } from "@/lib/permissions/codes";
import { isIndentEditable, mayEditIndentAs } from "@/lib/material/procurement";
import { IndentForm } from "../../new/indent-form";
import { indentLookups } from "../../lookups";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const i = await prisma.indent.findUnique({ where: { id }, select: { indentNo: true } });
  return { title: i ? `Edit ${i.indentNo}` : "Edit Indent" };
}

export default async function EditIndentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requirePermission(PERM.material.indent.view, PERM.material.indent.update);

  const indent = await prisma.indent.findUnique({
    where: { id },
    include: {
      project: { select: { code: true, name: true } },
      items: true,
      _count: { select: { approvals: true } },
    },
  });
  if (!indent) notFound();

  if (!ctx.canAccessAllProjects && !ctx.projectIds.includes(indent.projectId)) {
    redirect(`/forbidden?code=${encodeURIComponent(PERM.project.project.accessAll)}`);
  }
  if (!mayEditIndentAs(indent, { id: ctx.id, hasViewAll: ctx.has(PERM.material.indent.viewAll) })) {
    redirect(`/forbidden?code=${encodeURIComponent(PERM.material.indent.viewAll)}`);
  }
  if (!isIndentEditable({ status: indent.status, approvalCount: indent._count.approvals })) {
    redirect(`/material/indents/${id}`);
  }

  const [{ items: activeItems }, workPackages] = await Promise.all([
    indentLookups(ctx),
    prisma.workPackage.findMany({
      where: { phase: { projectId: indent.projectId } },
      orderBy: { code: "asc" },
      select: { id: true, code: true, name: true },
    }),
  ]);

  // Keep an item deactivated since the indent was raised selectable on its line.
  const known = new Set(activeItems.map((i) => i.id));
  const missingIds = indent.items.map((l) => l.itemId).filter((itemId) => !known.has(itemId));
  const missing = missingIds.length
    ? await prisma.item.findMany({
        where: { id: { in: missingIds } },
        select: {
          id: true, code: true, name: true, standardRate: true,
          uom: { select: { code: true } }, category: { select: { name: true } },
        },
      })
    : [];
  const items = [
    ...activeItems,
    ...missing.map((i) => ({
      id: i.id, code: i.code, name: i.name, uom: i.uom.code,
      category: i.category.name, standardRate: Number(i.standardRate), onHand: 0,
    })),
  ];

  return (
    <IndentForm
        projects={[{ id: indent.projectId, name: indent.project.name, code: indent.project.code, workPackages }]}
        items={items}
        canSubmit={false}
        edit={{
          indentId: indent.id,
          indentNo: indent.indentNo,
          projectId: indent.projectId,
          projectLabel: `${indent.project.code} — ${indent.project.name}`,
          workPackages,
          initial: {
            workPackageId: indent.workPackageId ?? "",
            requiredByDate: indent.requiredByDate.toISOString().slice(0, 10),
            purpose: indent.purpose ?? "",
            remarks: indent.remarks ?? "",
            lines: indent.items.map((l) => ({
              id: l.id,
              itemId: l.itemId,
              requestedQty: Number(l.requestedQty),
              estimatedRate: Number(l.estimatedRate),
              specification: l.specification ?? "",
            })),
          },
        }}
      />
  );
}
