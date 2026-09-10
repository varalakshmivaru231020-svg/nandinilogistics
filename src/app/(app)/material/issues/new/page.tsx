import Link from "next/link";
import { ChevronRight } from "lucide-react";

import { requirePermission } from "@/lib/rbac/guard";
import { PERM } from "@/lib/permissions/codes";
import { PageHeader } from "@/components/ui/primitives";
import { IssueForm } from "./issue-form";
import { issueLookups } from "../lookups";

export const metadata = { title: "Issue Material" };

export default async function NewIssuePage() {
  const ctx = await requirePermission(PERM.material.issue.create);

  const { projects, stores, recipients, stock } = await issueLookups(ctx);

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="Issue material"
        description="Moves stock out of the store and onto a work package, valued at the store's weighted-average rate."
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
      />
    </div>
  );
}
