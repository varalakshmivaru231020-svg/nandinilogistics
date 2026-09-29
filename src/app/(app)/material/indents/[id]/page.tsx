import { notFound, redirect } from "next/navigation";

import { requirePermission } from "@/lib/rbac/guard";
import { prisma } from "@/lib/db";
import { PERM } from "@/lib/permissions/codes";
import { isIndentEditable, mayEditIndentAs } from "@/lib/material/procurement";
import { fulfilLines } from "@/lib/material/indent-lines";
import { formatDateTime, qty } from "@/lib/utils";
import { IndentDetail } from "./indent-detail";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const i = await prisma.indent.findUnique({ where: { id }, select: { indentNo: true } });
  return { title: i?.indentNo ?? "Indent" };
}

/** The design writes the required-by date plainly, as it was entered. */
function isoDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

export default async function IndentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requirePermission(PERM.material.indent.view);

  const indent = await prisma.indent.findUnique({
    where: { id },
    include: {
      project: { select: { id: true, name: true } },
      workPackage: { select: { name: true } },
      raisedBy: { select: { name: true, designation: { select: { name: true } } } },
      items: {
        include: { item: { select: { code: true, name: true, uom: { select: { name: true } } } } },
      },
      _count: { select: { items: true, approvals: true } },
    },
  });
  if (!indent) notFound();

  if (!ctx.canAccessAllProjects && !ctx.projectIds.includes(indent.projectId)) {
    redirect(`/forbidden?code=${encodeURIComponent(PERM.project.project.accessAll)}`);
  }
  if (indent.raisedById !== ctx.id && !ctx.has(PERM.material.indent.viewAll)) {
    redirect(`/forbidden?code=${encodeURIComponent(PERM.material.indent.viewAll)}`);
  }

  const lineMap = await fulfilLines([indent]);
  const fulfil = lineMap.get(indent.id) ?? [];

  // What has actually moved against this indent: issues to site, and anything
  // the site sent back.
  const issues = await prisma.materialIssue.findMany({
    where: { indentId: indent.id },
    orderBy: { issueDate: "desc" },
    include: {
      issuedBy: { select: { name: true } },
      store: { select: { name: true } },
      workPackage: { select: { name: true } },
      items: { include: { item: { select: { name: true } } } },
      returns: {
        where: { status: "APPROVED" },
        include: {
          raisedBy: { select: { name: true } },
          store: { select: { name: true } },
          items: { include: { item: { select: { name: true } } } },
        },
      },
    },
  });

  const recipientIds = [...new Set(issues.map((i) => i.issuedToId))];
  const recipients = recipientIds.length
    ? await prisma.user.findMany({ where: { id: { in: recipientIds } }, select: { id: true, name: true } })
    : [];
  const nameById = new Map(recipients.map((u) => [u.id, u.name]));

  const movements = [
    ...issues.flatMap((issue) =>
      issue.items.map((line) => ({
        id: line.id,
        kind: "ISSUE" as const,
        item: line.item.name,
        qty: `−${qty(Number(line.issuedQty), 2)}`,
        at: formatDateTime(issue.issueDate),
        by: issue.issuedBy.name,
        to: [nameById.get(issue.issuedToId) ?? "—", issue.workPackage?.name].filter(Boolean).join(" · "),
        note: line.remarks || issue.purpose || issue.remarks || "—",
        sortAt: issue.issueDate.getTime(),
      })),
    ),
    ...issues.flatMap((issue) =>
      issue.returns.flatMap((ret) =>
        ret.items.map((line) => ({
          id: line.id,
          kind: "RETURN" as const,
          item: line.item.name,
          qty: `+${qty(Number(line.quantity), 2)}`,
          at: formatDateTime(ret.returnDate),
          by: ret.raisedBy.name,
          to: ret.store.name,
          note: line.remarks || ret.reason || "—",
          sortAt: ret.returnDate.getTime(),
        })),
      ),
    ),
  ].sort((a, b) => b.sortAt - a.sortAt);

  // The design names an indent by what it asks for, not by its purpose line.
  const first = indent.items[0];
  const title = first
    ? `${first.item.name} · ${qty(Number(first.approvedQty ?? first.requestedQty), 2)} ${first.item.uom.name}` +
      (indent._count.items > 1 ? ` +${indent._count.items - 1} more` : "")
    : "No lines";

  return (
    <IndentDetail
      indent={{
        id: indent.id,
        indentNo: indent.indentNo,
        status: indent.status,
        updatedAt: indent.updatedAt.toISOString(),
        title,
        project: indent.project.name,
        activity: indent.workPackage?.name ?? "—",
        requiredBy: isoDate(indent.requiredByDate),
        raisedBy: indent.raisedBy.designation
          ? `${indent.raisedBy.name} · ${indent.raisedBy.designation.name}`
          : indent.raisedBy.name,
        remarks: indent.remarks || "No remarks",
      }}
      lines={indent.items.map((l, i) => ({
        code: l.item.code,
        name: l.item.name,
        ...fulfil[i],
      }))}
      movements={movements}
      can={{
        approvePm: ctx.has(PERM.material.indent.approvePm),
        approveAdmin: ctx.has(PERM.material.indent.approveAdmin),
        issue: ctx.has(PERM.material.issue.create),
        raisePo: ctx.has(PERM.material.purchaseOrder.create),
        delete: ctx.has(PERM.material.indent.delete),
        update:
          ctx.has(PERM.material.indent.update) &&
          isIndentEditable({ status: indent.status, approvalCount: indent._count.approvals }) &&
          mayEditIndentAs(indent, { id: ctx.id, hasViewAll: ctx.has(PERM.material.indent.viewAll) }),
      }}
    />
  );
}
