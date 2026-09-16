import { requirePermission } from "@/lib/rbac/guard";
import { prisma } from "@/lib/db";
import { PERM } from "@/lib/permissions/codes";
import { PageHeader } from "@/components/ui/primitives";
import { readUserListParams, userListWhere } from "@/lib/admin/list-filters";
import { UsersScreen } from "./users-screen";

export const metadata = { title: "Users" };

export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await requirePermission(PERM.admin.user.view);
  const listParams = readUserListParams(await searchParams);

  // Search, status and role — the same function the export uses.
  const where = userListWhere(listParams);

  const [users, roles, departments, designations] = await Promise.all([
    prisma.user.findMany({
      where,
      orderBy: { name: "asc" },
      include: {
        roles: { include: { role: { select: { id: true, name: true } } } },
        department: { select: { name: true } },
        designation: { select: { name: true } },
        _count: { select: { projectAccess: true, permissions: true } },
      },
    }),
    prisma.role.findMany({ where: { status: "ACTIVE" }, orderBy: { level: "asc" }, select: { id: true, name: true } }),
    prisma.department.findMany({ where: { status: "ACTIVE" }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.designation.findMany({ where: { status: "ACTIVE" }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);

  return (
    <div>
      <PageHeader
        title="Users"
        description="Platform accounts, the roles they hold, and the projects their data is scoped to."
      />

      <UsersScreen
        currentUserId={ctx.id}
        users={users.map((u) => ({
          id: u.id,
          employeeCode: u.employeeCode,
          name: u.name,
          email: u.email,
          phone: u.phone,
          status: u.status,
          isSuperAdmin: u.isSuperAdmin,
          lastLoginAt: u.lastLoginAt ? u.lastLoginAt.toISOString() : null,
          department: u.department?.name ?? null,
          designation: u.designation?.name ?? null,
          departmentId: u.departmentId,
          designationId: u.designationId,
          roles: u.roles.map((r) => ({ id: r.role.id, name: r.role.name })),
          projectCount: u._count.projectAccess,
          overrideCount: u._count.permissions,
        }))}
        roles={roles}
        departments={departments}
        designations={designations}
        can={{
          create: ctx.has(PERM.admin.user.create),
          update: ctx.has(PERM.admin.user.update),
          toggleStatus: ctx.has(PERM.admin.user.toggleStatus),
          resetPassword: ctx.has(PERM.admin.user.resetPassword),
          assignRoles: ctx.has(PERM.admin.user.assignRoles),
          export: ctx.has(PERM.admin.user.export),
        }}
      />
    </div>
  );
}
