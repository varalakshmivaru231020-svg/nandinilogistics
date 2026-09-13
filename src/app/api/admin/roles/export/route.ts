import { prisma } from "@/lib/db";
import { describeRoleFilters, readRoleListParams, roleListWhere } from "@/lib/admin/list-filters";
import { capRows, EXPORT_MAX_ROWS, exportGate, exportResponse } from "@/lib/exports/respond";
import { PERM } from "@/lib/permissions/codes";
import { PERMISSIONS } from "@/lib/permissions/registry";

export const dynamic = "force-dynamic";

/** Exports the role list — every role matching the screen's search and status. */
export async function GET(request: Request) {
  const gate = await exportGate(request, PERM.admin.role.view, PERM.admin.role.export);
  if (!gate.ok) return gate.response;
  const listParams = readRoleListParams(gate.params);

  const roles = await prisma.role.findMany({
    where: roleListWhere(listParams),
    orderBy: [{ level: "asc" }, { name: "asc" }],
    take: EXPORT_MAX_ROWS + 1,
    include: { _count: { select: { users: true, permissions: true } } },
  });
  const { rows, note } = capRows(roles);

  return exportResponse({
    ...gate,
    title: "Roles",
    entity: "Role",
    filters: describeRoleFilters(listParams),
    result: {
      columns: [
        { key: "name", header: "Role" },
        { key: "code", header: "Code" },
        { key: "description", header: "Description" },
        { key: "level", header: "Authority level", align: "right", format: "number" },
        { key: "permissions", header: "Permissions", align: "right", format: "number" },
        { key: "catalogue", header: "Of catalogue", align: "right", format: "number" },
        { key: "users", header: "Users", align: "right", format: "number" },
        { key: "system", header: "System role" },
        { key: "status", header: "Status" },
      ],
      rows: rows.map((r) => ({
        name: r.name,
        code: r.code,
        description: r.description ?? "",
        level: r.level,
        permissions: r._count.permissions,
        catalogue: PERMISSIONS.length,
        users: r._count.users,
        system: r.isSystem ? "Yes" : "No",
        status: r.status === "ACTIVE" ? "Active" : "Inactive",
      })),
      summary: [{ label: "Roles", value: note }],
      emptyMessage: "No roles match these filters.",
    },
  });
}
