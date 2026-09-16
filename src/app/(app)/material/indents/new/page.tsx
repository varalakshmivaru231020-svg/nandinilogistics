import { requirePermission } from "@/lib/rbac/guard";
import { PERM } from "@/lib/permissions/codes";
import { IndentForm } from "./indent-form";
import { indentLookups } from "../lookups";

export const metadata = { title: "Raise Indent" };

export default async function NewIndentPage({
  searchParams,
}: {
  searchParams: Promise<{ item?: string }>;
}) {
  const ctx = await requirePermission(PERM.material.indent.create);
  const { item: startWithItemId } = await searchParams;

  const { projects, items } = await indentLookups(ctx);

  return (
    <IndentForm
      projects={projects}
      items={items}
      canSubmit={ctx.has(PERM.material.indent.submit)}
      startWithItemId={startWithItemId}
    />
  );
}
