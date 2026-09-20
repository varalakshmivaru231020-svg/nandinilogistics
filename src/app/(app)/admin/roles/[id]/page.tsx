import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight } from "lucide-react";

import { requirePermission } from "@/lib/rbac/guard";
import { prisma } from "@/lib/db";
import { PERM } from "@/lib/permissions/codes";
import { LIVE_PERMISSIONS, MODULES } from "@/lib/permissions/registry";
import { Badge, PageHeader } from "@/components/ui/primitives";
import { PermissionMatrix } from "./permission-matrix";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const role = await prisma.role.findUnique({ where: { id }, select: { name: true } });
  return { title: role ? `${role.name} — Permissions` : "Role" };
}

export default async function RoleDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requirePermission(PERM.admin.role.view);

  const role = await prisma.role.findUnique({
    where: { id },
    include: {
      permissions: { include: { permission: { select: { code: true } } } },
      users: { include: { user: { select: { id: true, name: true, email: true, status: true } } } },
    },
  });
  if (!role) notFound();

  const granted = role.permissions.map((p) => p.permission.code);

  return (
    <div>
      <PageHeader
        title={role.name}
        description={role.description ?? undefined}
        breadcrumb={
          <span className="flex items-center gap-1">
            <Link href="/admin/roles" className="hover:text-brand-600">Roles &amp; Permissions</Link>
            <ChevronRight className="h-3 w-3" />
            <code>{role.code}</code>
          </span>
        }
        actions={
          <div className="flex items-center gap-2">
            {role.isSystem && <Badge tone="brand">System role</Badge>}
            <Badge tone={role.status === "ACTIVE" ? "good" : "slate"}>
              {role.status === "ACTIVE" ? "Active" : "Inactive"}
            </Badge>
            <Badge tone="slate">{role.users.length} user(s)</Badge>
          </div>
        }
      />

      {ctx.has(PERM.admin.role.tabPermissions) && (
        <PermissionMatrix
          roleId={role.id}
          roleName={role.name}
          granted={granted}
          permissions={LIVE_PERMISSIONS.map((p) => ({
            code: p.code, module: p.module, resource: p.resource, action: p.action,
            label: p.label, description: p.description ?? null, group: p.group, kind: p.kind,
          }))}
          modules={MODULES}
          readOnly={!ctx.has(PERM.admin.role.managePermissions)}
          // The people holding the role are a panel of their own permission.
          users={ctx.has(PERM.admin.role.tabUsers) ? role.users.map((u) => u.user) : []}
        />
      )}
    </div>
  );
}
