import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight } from "lucide-react";

import { requirePermission } from "@/lib/rbac/guard";
import { prisma } from "@/lib/db";
import { PERM } from "@/lib/permissions/codes";
import { PERMISSIONS } from "@/lib/permissions/registry";
import { Badge, PageHeader } from "@/components/ui/primitives";
import { UserAccessScreen } from "./user-access-screen";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await prisma.user.findUnique({ where: { id }, select: { name: true } });
  return { title: user ? `${user.name} — Access` : "User" };
}

export default async function UserDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requirePermission(PERM.admin.user.view);

  const [user, roles, projects, recentActivity] = await Promise.all([
    prisma.user.findUnique({
      where: { id },
      include: {
        roles: { include: { role: { include: { permissions: { include: { permission: { select: { code: true } } } } } } } },
        permissions: { include: { permission: { select: { code: true } } } },
        projectAccess: { select: { projectId: true } },
        department: { select: { name: true } },
        designation: { select: { name: true } },
      },
    }),
    prisma.role.findMany({ orderBy: { level: "asc" }, select: { id: true, name: true, code: true, status: true, _count: { select: { permissions: true } } } }),
    prisma.project.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, code: true, status: true } }),
    ctx.has(PERM.admin.user.tabActivity)
      ? prisma.auditLog.findMany({ where: { userId: id }, orderBy: { createdAt: "desc" }, take: 30 })
      : Promise.resolve([]),
  ]);

  if (!user) notFound();

  // Same resolution the runtime uses: role union, plus ALLOW, minus DENY.
  const fromRoles = new Set<string>();
  for (const ur of user.roles) {
    for (const rp of ur.role.permissions) fromRoles.add(rp.permission.code);
  }
  const overrides = user.permissions.map((p) => ({ code: p.permission.code, effect: p.effect }));
  const effective = new Set(fromRoles);
  for (const o of overrides) {
    if (o.effect === "ALLOW") effective.add(o.code);
  }
  for (const o of overrides) {
    if (o.effect === "DENY") effective.delete(o.code);
  }

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        title={user.name}
        description={`${user.employeeCode} · ${user.email}${user.designation ? ` · ${user.designation.name}` : ""}`}
        breadcrumb={
          <span className="flex items-center gap-1">
            <Link href="/admin/users" className="hover:text-brand-600">Users</Link>
            <ChevronRight className="h-3 w-3" />
            <span>Access</span>
          </span>
        }
        actions={
          <div className="flex items-center gap-2">
            {user.isSuperAdmin && <Badge tone="violet">Super admin</Badge>}
            <Badge tone={user.status === "ACTIVE" ? "green" : "slate"}>{user.status}</Badge>
          </div>
        }
      />

      <UserAccessScreen
        userId={user.id}
        userName={user.name}
        isSuperAdmin={user.isSuperAdmin}
        roles={roles.map((r) => ({
          id: r.id, name: r.name, code: r.code, status: r.status, permissionCount: r._count.permissions,
        }))}
        assignedRoleIds={user.roles.map((r) => r.roleId)}
        projects={projects}
        assignedProjectIds={user.projectAccess.map((p) => p.projectId)}
        overrides={overrides}
        fromRoles={[...fromRoles]}
        effective={[...effective]}
        permissions={PERMISSIONS.map((p) => ({
          code: p.code, label: p.label, group: p.group, kind: p.kind, module: p.module,
        }))}
        activity={recentActivity.map((a) => ({
          id: a.id, action: a.action, entity: a.entity, summary: a.summary,
          createdAt: a.createdAt.toISOString(),
        }))}
        can={{
          assignRoles: ctx.has(PERM.admin.user.assignRoles),
          assignPermissions: ctx.has(PERM.admin.user.assignPermissions),
          assignProjects: ctx.has(PERM.admin.user.assignProjects),
          tabRoles: ctx.has(PERM.admin.user.tabRoles),
          tabPermissions: ctx.has(PERM.admin.user.tabPermissions),
          tabProjects: ctx.has(PERM.admin.user.tabProjects),
          tabActivity: ctx.has(PERM.admin.user.tabActivity),
        }}
      />
    </div>
  );
}
