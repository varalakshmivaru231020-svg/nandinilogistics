import { notFound } from "next/navigation";

import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/rbac/guard";
import { PERM } from "@/lib/permissions/codes";
import { employeeScope } from "@/lib/hr/list-filters";
import { EmployeeForm } from "../../employee-form";
import { EMPLOYEE_FORM_INCLUDE, employeeFormLists, employeeFormRow, isStaffType } from "../../employee-form-data";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const e = await prisma.employee.findUnique({ where: { id }, select: { name: true } });
  return { title: e ? `Edit · ${e.name}` : "Edit employee" };
}

/** Editing a record, on the same page the record was added on. */
export default async function EditEmployeePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requirePermission(PERM.hr.employee.view, PERM.hr.employee.update);

  // Scoped like the list: a record outside the viewer's team is not found.
  const employee = await prisma.employee.findFirst({
    where: { id, ...employeeScope(ctx) },
    include: EMPLOYEE_FORM_INCLUDE,
  });
  if (!employee) notFound();

  const group = isStaffType(employee.employmentType.name) ? "staff" : "riders";
  const lists = await employeeFormLists({
    group,
    canCreateStaff: ctx.has(PERM.hr.employee.createStaff),
    currentTypeId: employee.employmentType.id,
  });

  return (
    <EmployeeForm
      employee={employeeFormRow(employee, ctx.has(PERM.hr.employee.viewIdentity))}
      {...lists}
      canManageCompanies={ctx.has(PERM.hr.employee.manageCompanies)}
      backHref={`/hr/${id}`}
      afterSaveHref={`/hr/${id}`}
    />
  );
}
