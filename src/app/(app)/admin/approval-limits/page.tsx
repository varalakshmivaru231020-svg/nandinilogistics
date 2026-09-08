import { requirePermission } from "@/lib/rbac/guard";
import { prisma } from "@/lib/db";
import { PERM } from "@/lib/permissions/codes";
import { PageHeader } from "@/components/ui/primitives";
import { ApprovalLimitsScreen } from "./limits-screen";

export const metadata = { title: "Approval Limits" };

/** The approval chains that read a value ceiling. */
export const APPROVAL_SCOPES = [
  { value: "material.indent", label: "Material indent approval" },
  { value: "material.po", label: "Purchase order approval" },
  { value: "sales.discount", label: "Sales discount approval" },
];

export default async function ApprovalLimitsPage() {
  const ctx = await requirePermission(PERM.admin.approvalLimit.view);

  const [limits, roles, users] = await Promise.all([
    prisma.approvalLimit.findMany({
      orderBy: [{ scope: "asc" }, { maxValue: "asc" }],
      include: {
        role: { select: { name: true } },
        user: { select: { name: true, email: true } },
      },
    }),
    prisma.role.findMany({ where: { status: "ACTIVE" }, orderBy: { level: "asc" }, select: { id: true, name: true } }),
    prisma.user.findMany({ where: { status: "ACTIVE" }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="Approval Limits"
        description="The value ceilings that route approvals. Below a level's ceiling the next approval step is skipped automatically; above it, the document must go up."
      />

      <ApprovalLimitsScreen
        scopes={APPROVAL_SCOPES}
        limits={limits.map((l) => ({
          id: l.id,
          scope: l.scope,
          maxValue: Number(l.maxValue),
          roleName: l.role?.name ?? null,
          userName: l.user?.name ?? null,
        }))}
        roles={roles}
        users={users}
        can={{
          create: ctx.has(PERM.admin.approvalLimit.create),
          delete: ctx.has(PERM.admin.approvalLimit.delete),
        }}
      />
    </div>
  );
}
