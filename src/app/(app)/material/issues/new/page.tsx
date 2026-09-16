import Link from "next/link";
import { ChevronRight } from "lucide-react";

import { requirePermission } from "@/lib/rbac/guard";
import { prisma } from "@/lib/db";
import { PERM } from "@/lib/permissions/codes";
import { fulfilLines } from "@/lib/material/indent-lines";
import { indentFulfilment } from "@/lib/material/indent-fulfilment";
import { PageHeader } from "@/components/ui/primitives";
import { IssueForm, type FromIndent } from "./issue-form";
import { issueLookups } from "../lookups";

export const metadata = { title: "Issue Material" };

export default async function NewIssuePage({
  searchParams,
}: {
  searchParams: Promise<{ indent?: string }>;
}) {
  const ctx = await requirePermission(PERM.material.issue.create);
  const { indent: indentId } = await searchParams;

  const { projects, stores, recipients, stock } = await issueLookups(ctx);

  // Raised from an indent: the lines come pre-filled with what the store can
  // actually hand over today, which is what the indent screen promised.
  let fromIndent: FromIndent | null = null;
  if (indentId) {
    const indent = await prisma.indent.findUnique({
      where: { id: indentId },
      include: {
        items: { include: { item: { select: { uom: { select: { code: true } } } } } },
      },
    });
    if (indent && (ctx.canAccessAllProjects || ctx.projectIds.includes(indent.projectId))) {
      const fulfil = indentFulfilment((await fulfilLines([indent])).get(indent.id) ?? []).lines;
      fromIndent = {
        id: indent.id,
        indentNo: indent.indentNo,
        projectId: indent.projectId,
        workPackageId: indent.workPackageId,
        purpose: indent.purpose,
        lines: indent.items
          .map((l, i) => ({ itemId: l.itemId, quantity: fulfil[i]?.canIssue ?? 0 }))
          .filter((l) => l.quantity > 0),
      };
    }
  }

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="Issue material"
        description={
          fromIndent
            ? `Against ${fromIndent.indentNo} — pre-filled with the quantity the store can hand over today.`
            : "Moves stock out of the store and onto a work package, valued at the store's weighted-average rate."
        }
        breadcrumb={
          <span className="flex items-center gap-1">
            <Link href="/material/issues" className="hover:text-brand-600">Material Issues</Link>
            <ChevronRight className="h-3 w-3" />
            <span>New</span>
          </span>
        }
      />

      <IssueForm
        projects={projects}
        stores={stores}
        recipients={recipients}
        stock={stock}
        canViewValue={ctx.has(PERM.material.stock.viewValuation)}
        fromIndent={fromIndent}
      />
    </div>
  );
}
