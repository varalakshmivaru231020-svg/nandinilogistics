"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { deletePayslipAction } from "../actions";

export function PayslipActions({ id, hasPdf, canDelete }: { id: string; hasPdf: boolean; canDelete: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [deleting, setDeleting] = React.useState(false);
  const [busy, setBusy] = React.useState(false);

  async function remove() {
    setBusy(true);
    const res = await deletePayslipAction(id);
    setBusy(false);
    if (!res.ok) { toast(res.error, "bad"); return; }
    toast("Payslip deleted.");
    router.push("/staff/payslips");
  }

  return (
    <div className="flex items-center gap-2">
      {hasPdf && (
        <a href={`/api/staff/payslips/${id}`} target="_blank" rel="noreferrer" className="rounded-[9px] bg-brand-500 px-4 py-2.5 text-[12.5px] font-bold text-white hover:bg-brand-600">
          Download PDF
        </a>
      )}
      {canDelete && <Button variant="danger" size="sm" onClick={() => setDeleting(true)}>Delete</Button>}
      <ConfirmDialog
        open={deleting}
        onClose={() => setDeleting(false)}
        onConfirm={remove}
        title="Delete this payslip?"
        message="The record and its PDF go. It can be generated again afterwards."
        loading={busy}
      />
    </div>
  );
}
