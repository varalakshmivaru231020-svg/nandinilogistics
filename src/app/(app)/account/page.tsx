import { requireAuth } from "@/lib/rbac/guard";
import { prisma } from "@/lib/db";
import { PERMISSIONS } from "@/lib/permissions/registry";
import { Badge, Card, CardBody, CardHeader, CardTitle, PageHeader } from "@/components/ui/primitives";
import { formatDateTime, money } from "@/lib/utils";

export const metadata = { title: "My Account" };

/**
 * Self-service view: what am I allowed to do, and why. Needs no permission
 * beyond being signed in — a user may always see their own access.
 */
export default async function AccountPage() {
  const ctx = await requireAuth();

  const [user, projects] = await Promise.all([
    prisma.user.findUnique({
      where: { id: ctx.id },
      include: {
        department: { select: { name: true } },
        designation: { select: { name: true } },
        permissions: { include: { permission: { select: { code: true, label: true } } } },
      },
    }),
    prisma.project.findMany({
      where: ctx.canAccessAllProjects ? {} : { id: { in: ctx.projectIds } },
      select: { id: true, code: true, name: true, status: true },
      orderBy: { name: "asc" },
    }),
  ]);

  const byGroup = new Map<string, number>();
  for (const p of PERMISSIONS) {
    if (ctx.has(p.code)) byGroup.set(p.group, (byGroup.get(p.group) ?? 0) + 1);
  }
  const groups = [...byGroup.entries()].sort((a, b) => b[1] - a[1]);

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="My account"
        description="Your profile, your roles, and exactly what those roles let you do."
      />

      <div className="grid gap-3 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>Profile</CardTitle></CardHeader>
          <CardBody>
            <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
              {[
                ["Name", ctx.name],
                ["Employee code", ctx.employeeCode],
                ["Email", ctx.email],
                ["Phone", user?.phone ?? "—"],
                ["Department", user?.department?.name ?? "—"],
                ["Designation", user?.designation?.name ?? "—"],
                ["Last sign-in", formatDateTime(user?.lastLoginAt)],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt className="text-xs text-muted-500">{label}</dt>
                  <dd className="mt-0.5 text-sm text-navy-900">{value}</dd>
                </div>
              ))}
            </dl>
          </CardBody>
        </Card>

        <Card>
          <CardHeader><CardTitle>Access summary</CardTitle></CardHeader>
          <CardBody className="space-y-3">
            <div>
              <p className="text-xs text-muted-500">Roles</p>
              <div className="mt-1 flex flex-wrap gap-1">
                {ctx.roles.length === 0 && <span className="text-xs text-warn-700">None assigned</span>}
                {ctx.roles.map((r) => <Badge key={r.code} tone="brand">{r.name}</Badge>)}
              </div>
            </div>

            <div>
              <p className="text-xs text-muted-500">Effective permissions</p>
              <p className="num text-2xl font-semibold text-navy-950">
                {ctx.isSuperAdmin ? PERMISSIONS.length : ctx.permissions.size}
                <span className="ml-1 text-sm font-normal text-muted-400">of {PERMISSIONS.length}</span>
              </p>
              {ctx.isSuperAdmin && <Badge tone="navy">Super administrator</Badge>}
            </div>

            {Object.keys(ctx.approvalLimits).length > 0 && (
              <div className="border-t border-line-200 pt-2">
                <p className="mb-1 text-xs text-muted-500">Your approval ceilings</p>
                <ul className="space-y-0.5">
                  {Object.entries(ctx.approvalLimits).map(([scope, value]) => (
                    <li key={scope} className="flex justify-between text-xs">
                      <span className="text-muted-600">{scope}</span>
                      <span className="num font-medium text-navy-900">{money(value)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </CardBody>
        </Card>
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>What you can do</CardTitle>
            <span className="text-xs text-muted-500">By area</span>
          </CardHeader>
          <CardBody className="p-0">
            <ul className="divide-y divide-line-200">
              {groups.map(([group, count]) => (
                <li key={group} className="flex items-center justify-between px-4 py-2">
                  <span className="text-sm text-navy-600">{group}</span>
                  <span className="num text-xs font-medium text-muted-500">{count}</span>
                </li>
              ))}
              {groups.length === 0 && (
                <li className="px-4 py-8 text-center text-sm text-muted-500">
                  No permissions granted yet.
                </li>
              )}
            </ul>
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Your projects</CardTitle>
            <span className="text-xs text-muted-500">
              {ctx.canAccessAllProjects ? "You can access every project" : "Data is scoped to these"}
            </span>
          </CardHeader>
          <CardBody className="p-0">
            <ul className="divide-y divide-line-200">
              {projects.map((p) => (
                <li key={p.id} className="flex items-center justify-between px-4 py-2">
                  <div>
                    <p className="text-sm text-navy-900">{p.name}</p>
                    <code className="text-xs text-muted-400">{p.code}</code>
                  </div>
                  <Badge tone={p.status === "ACTIVE" ? "good" : "slate"}>{p.status}</Badge>
                </li>
              ))}
              {projects.length === 0 && (
                <li className="px-4 py-8 text-center text-sm text-muted-500">
                  You are not mapped to any project.
                </li>
              )}
            </ul>
          </CardBody>
        </Card>
      </div>

      {user && user.permissions.length > 0 && (
        <Card className="mt-3">
          <CardHeader>
            <CardTitle>Direct permission overrides on your account</CardTitle>
          </CardHeader>
          <CardBody className="p-0">
            <ul className="divide-y divide-line-200">
              {user.permissions.map((p) => (
                <li key={p.id} className="flex items-center justify-between px-4 py-2">
                  <div>
                    <p className="text-sm text-navy-600">{p.permission.label}</p>
                    <code className="text-[11px] text-muted-400">{p.permission.code}</code>
                  </div>
                  <Badge tone={p.effect === "ALLOW" ? "good" : "bad"}>{p.effect}</Badge>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      )}
    </div>
  );
}
