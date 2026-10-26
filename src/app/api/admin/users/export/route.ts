import { prisma } from "@/lib/db";
import {
  describeUserFilters, readUserListParams, USER_EXPORT_SELECT, USER_STATUS_LABEL, userListWhere,
} from "@/lib/admin/list-filters";
import { capRows, EXPORT_MAX_ROWS, exportGate, exportResponse } from "@/lib/exports/respond";
import { PERM } from "@/lib/permissions/codes";

export const dynamic = "force-dynamic";

/**
 * Exports the user list — every account matching the screen's search, status
 * and role. Reads only USER_EXPORT_SELECT: no password hash, session or token
 * ever reaches the file.
 */
export async function GET(request: Request) {
  const gate = await exportGate(request, PERM.admin.user.view, PERM.admin.user.export);
  if (!gate.ok) return gate.response;
  const { params } = gate;

  const listParams = readUserListParams(params);

  const [users, role] = await Promise.all([
    prisma.user.findMany({
      where: userListWhere(listParams),
      orderBy: { name: "asc" },
      take: EXPORT_MAX_ROWS + 1,
      select: USER_EXPORT_SELECT,
    }),
    listParams.role ? prisma.role.findUnique({ where: { id: listParams.role }, select: { name: true } }) : null,
  ]);
  const { rows, note } = capRows(users);

  return exportResponse({
    ...gate,
    title: "Users",
    entity: "User",
    filters: describeUserFilters(listParams, role?.name ?? null),
    result: {
      columns: [
        { key: "employeeCode", header: "Employee code" },
        { key: "name", header: "Name" },
        { key: "email", header: "Email" },
        { key: "phone", header: "Phone" },
        { key: "roles", header: "Roles" },
        { key: "department", header: "Department" },
        { key: "designation", header: "Designation" },
        { key: "status", header: "Status" },
        { key: "superAdmin", header: "Super admin" },
        { key: "lastLoginAt", header: "Last sign-in", format: "date" },
        { key: "createdAt", header: "Created on", format: "date" },
      ],
      rows: rows.map((u) => ({
        id: u.id,
        employeeCode: u.employeeCode,
        name: u.name,
        email: u.email,
        phone: u.phone ?? "",
        roles: u.roles.map((r) => r.role.name).join(", "),
        department: u.department?.name ?? "",
        designation: u.designation?.name ?? "",
        status: USER_STATUS_LABEL[u.status],
        superAdmin: u.isSuperAdmin ? "Yes" : "No",
        lastLoginAt: u.lastLoginAt,
        createdAt: u.createdAt,
      })),
      summary: [{ label: "Users", value: note }],
      emptyMessage: "No users match these filters.",
    },
  });
}
