"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { Can } from "@/components/rbac/can";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Field, Textarea } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { PERM } from "@/lib/permissions/codes";
import { decideProfileEditAction } from "../actions";

export interface EditRequestRow {
  id: string;
  employeeId: string;
  rider: string;
  riderCode: string;
  requestedOn: string;
  reason: string | null;
  status: string;
  decisionNote: string | null;
  changes: Array<{ label: string; from: string; to: string }>;
}

/**
 * Profile change requests from the app — what was asked, against what the
 * record holds now, and Approve / Reject for whoever may update the record.
 */
export function EditRequestsPanel({ rows, showRider = true }: { rows: EditRequestRow[]; showRider?: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = React.useState<string | null>(null);
  const [rejecting, setRejecting] = React.useState<EditRequestRow | null>(null);
  const [note, setNote] = React.useState("");

  async function decide(id: string, decision: "APPROVED" | "REJECTED", why: string) {
    setBusy(id);
    const res = await decideProfileEditAction(id, decision, why);
    setBusy(null);
    if (!res.ok) {
      toast(res.error ?? "Something went wrong.", "bad");
      return false;
    }
    toast(decision === "APPROVED" ? "Change approved and applied." : "Change rejected.");
    router.refresh();
    return true;
  }

  if (rows.length === 0) {
    return <p className="text-sm text-navy-500">No profile change requests.</p>;
  }

  return (
    <div className="space-y-3">
      {rows.map((r) => (
        <div key={r.id} className="rounded-lg border border-line-400 bg-white p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-sm">
              {showRider && (
                <Link href={`/hr/${r.employeeId}`} className="font-semibold text-navy-800 hover:underline">
                  {r.rider} · {r.riderCode}
                </Link>
              )}
              <span className="ml-2 text-navy-500">Requested {r.requestedOn}</span>
            </div>
            <span className="text-xs font-semibold uppercase text-navy-500">{r.status}</span>
          </div>
          <table className="mt-2 w-full text-sm">
            <tbody>
              {r.changes.map((c) => (
                <tr key={c.label}>
                  <td className="py-1 pr-3 text-navy-500">{c.label}</td>
                  <td className="py-1 pr-3 line-through text-navy-400">{c.from || "—"}</td>
                  <td className="py-1 font-medium text-navy-800">{c.to}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {r.reason && <p className="mt-2 text-sm text-navy-600">Reason: {r.reason}</p>}
          {r.decisionNote && <p className="mt-1 text-sm text-navy-600">Note: {r.decisionNote}</p>}
          {r.status === "PENDING" && (
            <Can I={PERM.hr.employee.update}>
              <div className="mt-3 flex gap-2">
                <Button size="sm" loading={busy === r.id} onClick={() => void decide(r.id, "APPROVED", "")}>
                  Approve
                </Button>
                <Button size="sm" variant="outline" onClick={() => { setNote(""); setRejecting(r); }}>
                  Reject
                </Button>
              </div>
            </Can>
          )}
        </div>
      ))}

      {rejecting && (
        <Modal
          open
          onClose={() => setRejecting(null)}
          title="Reject profile change"
          size="sm"
          footer={
            <>
              <Button variant="outline" type="button" onClick={() => setRejecting(null)}>Cancel</Button>
              <Button
                loading={busy === rejecting.id}
                onClick={async () => {
                  if (await decide(rejecting.id, "REJECTED", note)) setRejecting(null);
                }}
              >
                Reject
              </Button>
            </>
          }
        >
          <Field label="Reason" required>
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} />
          </Field>
        </Modal>
      )}
    </div>
  );
}
