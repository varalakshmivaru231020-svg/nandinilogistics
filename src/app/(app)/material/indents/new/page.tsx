import Link from "next/link";
import { ChevronRight } from "lucide-react";

import { requirePermission } from "@/lib/rbac/guard";
import { PERM } from "@/lib/permissions/codes";
import { PageHeader } from "@/components/ui/primitives";
import { IndentForm } from "./indent-form";
import { indentLookups } from "../lookups";

export const metadata = { title: "Raise Indent" };

export default async function NewIndentPage() {
  const ctx = await requirePermission(PERM.material.indent.create);

  const { projects, items } = await indentLookups(ctx);

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="Raise an indent"
        description="Item, quantity, required-by date and the activity it is for — captured where the work is, not reconstructed later."
        breadcrumb={
          <span className="flex items-center gap-1">
            <Link href="/material/indents" className="hover:text-brand-600">Indents</Link>
            <ChevronRight className="h-3 w-3" />
            <span>New</span>
          </span>
        }
      />

      <IndentForm
        projects={projects}
        items={items}
        canSubmit={ctx.has(PERM.material.indent.submit)}
      />
    </div>
  );
}
