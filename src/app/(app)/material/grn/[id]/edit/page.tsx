import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChevronRight } from "lucide-react";

import { requirePermission } from "@/lib/rbac/guard";
import { prisma } from "@/lib/db";
import { PERM } from "@/lib/permissions/codes";
import { PageHeader } from "@/components/ui/primitives";
import { GrnEditForm } from "./grn-edit-form";

export const metadata = { title: "Edit goods receipt" };

export default async function EditGrnPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requirePermission(PERM.material.grn.update);

  const grn = await prisma.grn.findUnique({
    where: { id },
    include: { purchaseOrder: { select: { poNo: true, projectId: true } } },
  });
  if (!grn) notFound();

  if (!ctx.canAccessAllProjects && !ctx.projectIds.includes(grn.purchaseOrder.projectId)) {
    redirect(`/forbidden?code=${encodeURIComponent(PERM.project.project.accessAll)}`);
  }

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title={`Edit ${grn.grnNo}`}
        description={`Against ${grn.purchaseOrder.poNo}`}
        breadcrumb={
          <span className="flex items-center gap-1">
            <Link href="/material/grn" className="hover:text-brand-600">Goods Receipt</Link>
            <ChevronRight className="h-3 w-3" />
            <Link href={`/material/grn/${grn.id}`} className="hover:text-brand-600">{grn.grnNo}</Link>
          </span>
        }
      />
      <GrnEditForm
        grn={{
          id: grn.id,
          grnNo: grn.grnNo,
          updatedAt: grn.updatedAt.toISOString(),
          posted: grn.status === "POSTED",
          challanNo: grn.challanNo ?? "",
          challanDate: grn.challanDate ? grn.challanDate.toISOString().slice(0, 10) : "",
          vehicleNo: grn.vehicleNo ?? "",
          remarks: grn.remarks ?? "",
        }}
      />
    </div>
  );
}
