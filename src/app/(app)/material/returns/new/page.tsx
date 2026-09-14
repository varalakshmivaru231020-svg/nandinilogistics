import Link from "next/link";
import { ChevronRight } from "lucide-react";

import { requirePermission } from "@/lib/rbac/guard";
import { PERM } from "@/lib/permissions/codes";
import { readId } from "@/lib/material/list-filters";
import { PageHeader } from "@/components/ui/primitives";
import { returnableIssues } from "../lookups";
import { ReturnForm } from "./return-form";

export const metadata = { title: "New Material Return" };

export default async function NewReturnPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await requirePermission(PERM.material.return.create);
  const preselect = readId(await searchParams, "issue");
  const issues = await returnableIssues(ctx, preselect);

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="Return material"
        description="Send unused material back to the store it was issued from. Nothing moves until the store approves the return."
        breadcrumb={
          <span className="flex items-center gap-1">
            <Link href="/material/returns" className="hover:text-brand-600">Material Returns</Link>
            <ChevronRight className="h-3 w-3" />
            <span>New</span>
          </span>
        }
      />

      <ReturnForm
        issues={issues}
        initialIssueId={preselect && issues.some((i) => i.id === preselect) ? preselect : (issues[0]?.id ?? "")}
        canViewValue={ctx.has(PERM.material.stock.viewValuation)}
      />
    </div>
  );
}
