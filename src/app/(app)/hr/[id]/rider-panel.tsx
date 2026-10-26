"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Field, Input, Textarea } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { ONBOARDING_LABEL, ONBOARDING_TONE, type OnboardingStatus } from "@/lib/riders/onboarding";
import {
  acceptOnboardingAction, regenerateOfferLetterAction, rejectOnboardingAction,
  sendOfferLetterWhatsAppAction, setRiderPinAction, submitOnboardingAction,
} from "../actions";

const TONE: Record<string, string> = {
  draft: "border-line-400 bg-surface-field text-navy-500",
  warn: "border-amber-200 bg-warn-050 text-warn-700",
  good: "border-good-200 bg-good-050 text-good-700",
  bad: "border-bad-100 bg-bad-050 text-bad-700",
};

export interface ReferralRow {
  id: string;
  name: string;
  code: string;
  joinedOn: string | null;
  status: string;
  eligible: boolean;
}

/**
 * The rider's onboarding card, their offer letter and ID card, the app PIN
 * and the riders they referred — SOW §3.2, §3.5 and §3.6.
 */
export function RiderPanel({
  rider, missing, referrals, can,
}: {
  rider: {
    id: string; name: string; code: string;
    onboardingStatus: OnboardingStatus;
    submittedAt: string | null; decidedAt: string | null; decidedBy: string | null;
    rejectionReason: string | null;
    hasOfferLetter: boolean; offerLetterAt: string | null;
    referralCode: string | null; referredBy: string | null;
    hasLogin: boolean;
    leadNo: string | null; leadId: string | null;
  };
  /** What the form still needs before it can be submitted. */
  missing: string[];
  referrals: ReferralRow[];
  can: {
    submit: boolean; accept: boolean; reject: boolean;
    offerLetter: boolean; idCard: boolean; setPin: boolean;
  };
}) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = React.useState<string | null>(null);
  const [rejecting, setRejecting] = React.useState(false);
  const [reason, setReason] = React.useState("");
  const [pinning, setPinning] = React.useState(false);
  const [pin, setPin] = React.useState("");

  async function run(key: string, fn: () => Promise<{ ok: boolean; error?: string }>, done: string) {
    setBusy(key);
    const res = await fn();
    setBusy(null);
    if (!res.ok) { toast(res.error ?? "Something went wrong.", "bad"); return false; }
    toast(done);
    router.refresh();
    return true;
  }

  const status = rider.onboardingStatus;
  const canSubmit = can.submit && (status === "DRAFT" || status === "REJECTED");
  const canDecide = status === "SUBMITTED";

  return (
    <>
      <div className="rounded-[13px] border border-line-400 bg-white px-5 py-[18px]">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="text-[11px] font-bold uppercase tracking-[.12em] text-muted-400">Onboarding</div>
          <span className={cn("rounded-full border px-[10px] py-[5px] text-[10.5px] font-bold", TONE[ONBOARDING_TONE[status]])}>
            {ONBOARDING_LABEL[status]}
          </span>
        </div>

        <div className="grid gap-x-6 gap-y-2 text-[12px] sm:grid-cols-2">
          {rider.leadNo && (
            <p className="text-muted-600">
              From lead{" "}
              {rider.leadId ? (
                <Link href={`/sales/leads/${rider.leadId}`} className="font-bold text-brand-700 hover:underline">{rider.leadNo}</Link>
              ) : (
                <span className="font-bold text-navy-900">{rider.leadNo}</span>
              )}
            </p>
          )}
          {rider.submittedAt && <p className="text-muted-600">Submitted {rider.submittedAt}</p>}
          {rider.decidedAt && (
            <p className="text-muted-600">
              {status === "ACCEPTED" ? "Accepted" : status === "REJECTED" ? "Rejected" : "Decided"} {rider.decidedAt}
              {rider.decidedBy ? ` by ${rider.decidedBy}` : ""}
            </p>
          )}
        </div>

        {status === "REJECTED" && rider.rejectionReason && (
          <div className="mt-3 rounded-[10px] border border-bad-100 bg-bad-050 px-3.5 py-2.5 text-[12px] font-medium text-bad-700">
            Rejected: {rider.rejectionReason}. Correct the form and submit it again.
          </div>
        )}

        {(status === "DRAFT" || status === "REJECTED") && missing.length > 0 && (
          <div className="mt-3 rounded-[10px] border border-amber-200 bg-warn-050 px-3.5 py-2.5 text-[12px] font-medium text-warn-700">
            Before it can be submitted the form still needs: {missing.join(", ")}.
          </div>
        )}

        <div className="mt-3.5 flex flex-wrap gap-2">
          {canSubmit && (
            <Button
              size="sm"
              loading={busy === "submit"}
              disabled={missing.length > 0}
              onClick={() => run("submit", () => submitOnboardingAction(rider.id), `${rider.name} submitted for review`)}
            >
              Submit for review
            </Button>
          )}
          {can.accept && canDecide && (
            <Button
              size="sm"
              loading={busy === "accept"}
              onClick={() => run("accept", () => acceptOnboardingAction(rider.id), `${rider.name} accepted — rider active`)}
            >
              ✓ Accept
            </Button>
          )}
          {can.reject && canDecide && (
            <Button size="sm" variant="danger" onClick={() => { setReason(""); setRejecting(true); }}>
              Reject…
            </Button>
          )}
          {status === "ACCEPTED" && can.idCard && (
            <Link
              href={`/hr/${rider.id}/id-card`}
              className="rounded-[9px] border border-line-400 bg-white px-3.5 py-[7px] text-[12px] font-semibold text-navy-600 transition-colors hover:border-brand-500 hover:text-brand-700"
            >
              ID card
            </Link>
          )}
          {status === "ACCEPTED" && can.offerLetter && rider.hasOfferLetter && (
            <a
              href={`/api/hr/offer-letter/${rider.id}`}
              className="rounded-[9px] border border-line-400 bg-white px-3.5 py-[7px] text-[12px] font-semibold text-navy-600 transition-colors hover:border-brand-500 hover:text-brand-700"
            >
              ↓ Offer letter{rider.offerLetterAt ? ` · ${rider.offerLetterAt}` : ""}
            </a>
          )}
          {status === "ACCEPTED" && can.offerLetter && (
            <Button
              size="sm"
              variant="outline"
              loading={busy === "regen"}
              onClick={() => run("regen", () => regenerateOfferLetterAction(rider.id), "Offer letter generated")}
            >
              {rider.hasOfferLetter ? "Regenerate offer letter" : "Generate offer letter"}
            </Button>
          )}
          {status === "ACCEPTED" && can.offerLetter && rider.hasOfferLetter && (
            <Button
              size="sm"
              variant="outline"
              loading={busy === "wa"}
              onClick={async () => {
                setBusy("wa");
                const res = await sendOfferLetterWhatsAppAction(rider.id);
                setBusy(null);
                if (!res.ok) { toast(res.error, "bad"); return; }
                toast(res.data.sent ? "Sent on WhatsApp" : `Not sent — WhatsApp ${res.data.reason === "not-configured" ? "is not configured yet" : `refused (${res.data.reason})`}`, res.data.sent ? "default" : "bad");
              }}
            >
              Send on WhatsApp
            </Button>
          )}
          {status === "ACCEPTED" && can.setPin && (
            <Button size="sm" variant="outline" onClick={() => { setPin(""); setPinning(true); }}>
              {rider.hasLogin ? "Reset app PIN" : "Set app PIN"}
            </Button>
          )}
        </div>
      </div>

      <div className="rounded-[13px] border border-line-400 bg-white px-5 py-[18px]">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="text-[11px] font-bold uppercase tracking-[.12em] text-muted-400">Referrals</div>
          {rider.referralCode && (
            <span className="num rounded-full bg-brand-100 px-[10px] py-[5px] text-[10.5px] font-bold text-brand-700">
              Referral ID {rider.referralCode}
            </span>
          )}
        </div>
        {rider.referredBy && (
          <p className="mb-2 text-[12px] font-medium text-muted-600">Referred by <span className="font-bold text-navy-900">{rider.referredBy}</span></p>
        )}
        {referrals.length === 0 ? (
          <p className="text-[12px] font-medium text-muted-400">Nobody referred by {rider.name} yet.</p>
        ) : (
          <table className="w-full border-collapse text-[12px]">
            <thead>
              <tr className="text-left text-[10px] font-bold uppercase tracking-[.08em] text-muted-500">
                <th className="py-1.5">Rider</th>
                <th className="py-1.5">Joined</th>
                <th className="py-1.5">Referral</th>
              </tr>
            </thead>
            <tbody>
              {referrals.map((r) => (
                <tr key={r.id} className="border-t border-line-150">
                  <td className="py-2 font-semibold text-navy-900">
                    <Link href={`/hr/${r.id}`} className="hover:text-brand-700">{r.name}</Link>
                    <span className="num ml-1.5 text-[11px] font-medium text-muted-400">{r.code}</span>
                  </td>
                  <td className="py-2 font-medium text-navy-500">{r.joinedOn ?? "—"}</td>
                  <td className="py-2">
                    <span className={cn("rounded-full px-2.5 py-[4px] text-[10.5px] font-bold", r.eligible ? "bg-good-050 text-good-700" : "bg-surface-field text-navy-500")}>
                      {r.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <Modal
        open={rejecting}
        onClose={() => setRejecting(false)}
        title={`Reject ${rider.name}'s form?`}
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setRejecting(false)}>Cancel</Button>
            <Button
              variant="danger"
              loading={busy === "reject"}
              disabled={reason.trim().length < 3}
              onClick={async () => {
                if (await run("reject", () => rejectOnboardingAction(rider.id, reason), `${rider.name}'s form rejected`)) setRejecting(false);
              }}
            >
              Reject
            </Button>
          </>
        }
      >
        <Field label="Reason" required>
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} placeholder="What has to be corrected" />
        </Field>
      </Modal>

      <Modal
        open={pinning}
        onClose={() => setPinning(false)}
        title={rider.hasLogin ? "Reset app PIN" : "Set app PIN"}
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setPinning(false)}>Cancel</Button>
            <Button
              loading={busy === "pin"}
              disabled={!/^\d{4}$/.test(pin)}
              onClick={async () => {
                if (await run("pin", () => setRiderPinAction(rider.id, pin), "PIN set")) setPinning(false);
              }}
            >
              Save PIN
            </Button>
          </>
        }
      >
        <div className="space-y-2">
          <p className="text-[12.5px] font-medium text-muted-600">
            Four digits. The rider signs in to the app with their mobile number and this PIN. It is stored hashed and cannot be read back — set a new one if it is forgotten.
          </p>
          <Field label="PIN" required>
            <Input value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))} inputMode="numeric" placeholder="4 digits" />
          </Field>
        </div>
      </Modal>
    </>
  );
}
