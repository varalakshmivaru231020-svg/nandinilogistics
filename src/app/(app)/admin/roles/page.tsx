
import { requirePermission } from "@/lib/rbac/guard";
import { prisma } from "@/lib/db";
import { PERM } from "@/lib/permissions/codes";
import { LIVE_PERMISSIONS } from "@/lib/permissions/registry";
import { PageHeader } from "@/components/ui/primitives";
import { readRoleListParams, roleListWhere } from "@/lib/admin/list-filters";
import { RolesScreen } from "./roles-screen";

export const metadata = { title: "Roles & Permissions" };

export default async function RolesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await requirePermission(PERM.admin.role.view);
  const listParams = readRoleListParams(await searchParams);

  const roles = await prisma.role.findMany({
    // Search and status — the same function the export uses.
    where: roleListWhere(listParams),
    orderBy: [{ level: "asc" }, { name: "asc" }],
    include: {
      _count: { select: { users: true, permissions: true } },
    },
  });

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Roles & Permissions"
        description={`Every role is a named set of permissions drawn from a catalogue of ${LIVE_PERMISSIONS.length}. Change a role here and every screen, tab and button follows immediately.`}
      />

      <RolesScreen
        roles={roles.map((r) => ({
          id: r.id,
          code: r.code,
          name: r.name,
          description: r.description,
          level: r.level,
          isSystem: r.isSystem,
          status: r.status,
          userCount: r._count.users,
          permissionCount: r._count.permissions,
        }))}
        totalPermissions={LIVE_PERMISSIONS.length}
        can={{
          create: ctx.has(PERM.admin.role.create),
          update: ctx.has(PERM.admin.role.update),
          delete: ctx.has(PERM.admin.role.delete),
          clone: ctx.has(PERM.admin.role.clone),
          toggleStatus: ctx.has(PERM.admin.role.toggleStatus),
          managePermissions: ctx.has(PERM.admin.role.managePermissions),
          export: ctx.has(PERM.admin.role.export),
        }}
      />
    </div>
  );
}
