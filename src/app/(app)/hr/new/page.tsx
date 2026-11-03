import { requirePermission } from "@/lib/rbac/guard";
import { PERM } from "@/lib/permissions/codes";
import { isRiderType } from "@/lib/riders/onboarding";
import { EmployeeForm } from "../employee-form";
import { employeeFormLists } from "../employee-form-data";

export const metadata = { title: "New employee" };

/**
 * Adding a rider or a staff member, on a page of its own. `?type=staff` is the
 * Internal Staff page's button and needs the staff permission; anything else
 * is the Riders page's.
 */
export default async function NewEmployeePage({ searchParams }: { searchParams: Promise<{ type?: string }> }) {
  const { type } = await searchParams;
  const group = type === "staff" ? "staff" : "riders";
  const ctx = group === "staff"
    ? await requirePermission(PERM.hr.employee.create, PERM.hr.employee.createStaff)
    : await requirePermission(PERM.hr.employee.create);

  const lists = await employeeFormLists({ group, canCreateStaff: ctx.has(PERM.hr.employee.createStaff) });
  const defaultTypeId =
    lists.employmentTypes.find((t) => (group === "staff" ? t.name.trim().toLowerCase() === "internal staff" : isRiderType(t.name)))?.id
    ?? null;

  return (
    <EmployeeForm
      employee={null}
      {...lists}
      defaultTypeId={defaultTypeId}
      canManageCompanies={ctx.has(PERM.hr.employee.manageCompanies)}
      backHref={`/hr/${group}`}
      afterSaveHref={`/hr/${group}`}
    />
  );
}
