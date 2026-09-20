import { requirePermission } from "@/lib/rbac/guard";
import { prisma } from "@/lib/db";
import { PERM } from "@/lib/permissions/codes";
import { MODULES, PERMISSIONS } from "@/lib/permissions/registry";
import { Badge, Card, CardBody, PageHeader } from "@/components/ui/primitives";
import { PermissionCatalogue } from "./catalogue";

export const metadata = { title: "Permission Catalogue" };

export default async function PermissionsPage() {
  const ctx = await requirePermission(PERM.admin.permission.view);

  // Which roles hold each permission — the "who can do this?" answer.
  const rows = await prisma.rolePermission.findMany({
    include: {
      permission: { select: { code: true } },
      role: { select: { name: true, code: true } },
    },
  });

  const holders = new Map<string, string[]>();
  for (const r of rows) {
    holders.set(r.permission.code, [...(holders.get(r.permission.code) ?? []), r.role.name]);
  }

  const dbCount = await prisma.permission.count();

  return (
    <div>
      <PageHeader
        title="Permission Catalogue"
        description="Every guarded surface in the platform. This list is generated from the code registry, so it can never drift from what the application actually enforces."
        actions={
          <div className="flex items-center gap-2">
            <Badge tone="brand">{PERMISSIONS.length} in registry</Badge>
            <Badge tone={dbCount === PERMISSIONS.length ? "good" : "warn"}>{dbCount} in database</Badge>
          </div>
        }
      />

      {dbCount !== PERMISSIONS.length && (
        <Card className="mb-3 border-warn-050 bg-warn-050">
          <CardBody>
            <p className="text-sm text-warn-800">
              The database catalogue is out of step with the code registry. Run{" "}
              <code className="rounded bg-white px-1 py-0.5 text-xs">pnpm perms:sync</code> to
              reconcile them.
            </p>
          </CardBody>
        </Card>
      )}

      <PermissionCatalogue
        permissions={PERMISSIONS.map((p) => ({
          code: p.code, module: p.module, resource: p.resource, action: p.action,
          label: p.label, description: p.description ?? null, group: p.group, kind: p.kind,
          notYetBuilt: p.notYetBuilt,
          roles: holders.get(p.code) ?? [],
        }))}
        modules={MODULES}
        canExport={ctx.has(PERM.admin.permission.export)}
      />
    </div>
  );
}
