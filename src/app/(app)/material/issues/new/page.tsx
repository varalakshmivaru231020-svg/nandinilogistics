import { redirect } from "next/navigation";

import { requirePermission } from "@/lib/rbac/guard";
import { prisma } from "@/lib/db";
import { PERM } from "@/lib/permissions/codes";
import { fulfilLines } from "@/lib/material/indent-lines";
import { indentFulfilment } from "@/lib/material/indent-fulfilment";
import { IssueForm } from "./issue-form";
import { issueLookups } from "../lookups";

export const metadata = { title: "Issue Material" };

/**
 * Material is issued against an indent, as the design does it — the screen is
 * only reachable from one, and sends anyone else back to the indent list.
 */
export default async function NewIssuePage({
  searchParams,
}: {
  searchParams: Promise<{ indent?: string }>;
}) {
  const ctx = await requirePermission(PERM.material.issue.create);
  const { indent: indentId } = await searchParams;
  if (!indentId) redirect("/material/indents");

  const indent = await prisma.indent.findUnique({
    where: { id: indentId },
    include: {
      project: { select: { name: true } },
      workPackage: { select: { name: true } },
      items: { include: { item: { select: { code: true, name: true, uom: { select: { code: true } } } } } },
    },
  });
  if (!indent) redirect("/material/indents");
  if (!ctx.canAccessAllProjects && !ctx.projectIds.includes(indent.projectId)) {
    redirect(`/forbidden?code=${encodeURIComponent(PERM.project.project.accessAll)}`);
  }

  const { stores, recipients, stock } = await issueLookups(ctx);
  const fulfil = indentFulfilment((await fulfilLines([indent])).get(indent.id) ?? []).lines;

  const lines = indent.items
    .map((l, i) => ({
      itemId: l.itemId,
      code: l.item.code,
      name: l.item.name,
      uom: l.item.uom.code,
      required: fulfil[i]?.required ?? Number(l.approvedQty ?? l.requestedQty),
      onHand: fulfil[i]?.onHand ?? 0,
      pending: fulfil[i]?.pending ?? 0,
      canIssue: fulfil[i]?.canIssue ?? 0,
    }))
    .filter((l) => l.pending > 0);

  if (lines.length === 0) redirect(`/material/indents/${indent.id}`);

  return (
    <IssueForm
      stores={stores}
      recipients={recipients}
      stock={stock}
      issuedByName={ctx.name}
      fromIndent={{
        id: indent.id,
        indentNo: indent.indentNo,
        projectId: indent.projectId,
        projectName: indent.project.name,
        activity: indent.workPackage?.name ?? indent.purpose,
        workPackageId: indent.workPackageId,
        purpose: indent.purpose,
        lines,
      }}
    />
  );
}
