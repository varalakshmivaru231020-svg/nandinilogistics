import { requireAnyPermission } from "@/lib/rbac/guard";
import { prisma } from "@/lib/db";
import { PERM } from "@/lib/permissions/codes";
import { employeeScope } from "@/lib/hr/list-filters";
import { editRequestRows } from "@/lib/hr/edit-request-rows";
import { PageHeader } from "@/components/ui/primitives";
import { EditRequestsPanel } from "./edit-requests-panel";
import { ProfileEditForm } from "./profile-edit-form";

export const metadata = { title: "Profile change requests" };

/**
 * Profile change requests — riders and Team Leaders ask from the app; whoever
 * may update the record approves (which applies the change) or rejects.
 * Somebody who may only ask sees their own form and history here.
 */
export default async function EditRequestsPage() {
  const ctx = await requireAnyPermission(PERM.hr.employee.update, PERM.hr.employee.requestEdit);
  const canDecide = ctx.has(PERM.hr.employee.update);
  const canIdentity = ctx.has(PERM.hr.employee.viewIdentity);

  const own = ctx.has(PERM.hr.employee.requestEdit)
    ? await prisma.employee.findUnique({ where: { userId: ctx.id } })
    : null;

  const pending = canDecide
    ? await editRequestRows({ status: "PENDING", employee: employeeScope(ctx) }, canIdentity)
    : [];
  const mine = own ? await editRequestRows({ employeeId: own.id }, true) : [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Profile change requests"
        description="Changes riders ask for from the app. Approving applies the change to the record."
      />
      {canDecide && (
        <section>
          <h2 className="mb-2 text-sm font-semibold text-navy-800">Waiting for a decision · {pending.length}</h2>
          <EditRequestsPanel rows={pending} />
        </section>
      )}
      {own && (
        <section className="space-y-3">
          <ProfileEditForm
            current={{
              mobile: own.mobile,
              altContact: own.altContact ?? "",
              address: own.address ?? "",
              emergencyMobileFamily: own.emergencyMobileFamily ?? "",
              emergencyMobileFriend: own.emergencyMobileFriend ?? "",
              bankAccountNo: own.bankAccountNo ?? "",
              bankHolderName: own.bankHolderName ?? "",
              bankIfsc: own.bankIfsc ?? "",
              bankName: own.bankName ?? "",
              insuranceNumber: own.insuranceNumber ?? "",
            }}
          />
          <h2 className="text-sm font-semibold text-navy-800">My requests</h2>
          <EditRequestsPanel rows={mine} showRider={false} />
        </section>
      )}
    </div>
  );
}
