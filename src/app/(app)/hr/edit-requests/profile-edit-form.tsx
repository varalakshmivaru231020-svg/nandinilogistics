"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Alert, Field, Input, Textarea } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { requestProfileEditAction } from "../actions";

/**
 * "Request a profile change" — the caller's own record. Nothing changes until
 * it is approved. The app's `hr/profile:edit` form is this one, word for word.
 */
export function ProfileEditForm({ current }: { current: Record<string, string> }) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  return (
    <form
      className="grid gap-3 sm:grid-cols-2"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        const res = await requestProfileEditAction(new FormData(e.currentTarget));
        setBusy(false);
        if (!res.ok) { setError(res.error); return; }
        setError(null);
        toast("Change requested.");
        router.refresh();
      }}
    >
      <h2 className="text-sm font-semibold text-navy-800 sm:col-span-2">Request a profile change</h2>
      {error && <div className="sm:col-span-2"><Alert tone="error">{error}</Alert></div>}
      <Field label="Mobile number"><Input name="mobile" type="tel" defaultValue={current.mobile} placeholder="98765 43210" /></Field>
      <Field label="Alternate number"><Input name="altContact" type="tel" defaultValue={current.altContact} placeholder="98765 43210" /></Field>
      <Field label="Father / mother mobile"><Input name="emergencyMobileFamily" type="tel" defaultValue={current.emergencyMobileFamily} placeholder="98765 43210" /></Field>
      <Field label="Friend mobile"><Input name="emergencyMobileFriend" type="tel" defaultValue={current.emergencyMobileFriend} placeholder="98765 43210" /></Field>
      <div className="sm:col-span-2">
        <Field label="Address"><Textarea name="address" rows={2} defaultValue={current.address} placeholder="House, area, city" /></Field>
      </div>
      <Field label="Account number"><Input name="bankAccountNo" defaultValue={current.bankAccountNo} placeholder="Account number" /></Field>
      <Field label="Account holder name"><Input name="bankHolderName" defaultValue={current.bankHolderName} placeholder="As on the passbook" /></Field>
      <Field label="IFSC code"><Input name="bankIfsc" defaultValue={current.bankIfsc} placeholder="HDFC0001234" /></Field>
      <Field label="Bank name"><Input name="bankName" defaultValue={current.bankName} placeholder="Bank" /></Field>
      <Field label="Insurance number"><Input name="insuranceNumber" defaultValue={current.insuranceNumber} placeholder="Shown on the ID card" /></Field>
      <div className="sm:col-span-2">
        <Field label="Reason for the change"><Textarea name="reason" rows={2} placeholder="New number, bank changed…" /></Field>
      </div>
      <div className="sm:col-span-2">
        <Button type="submit" loading={busy}>Request change</Button>
      </div>
    </form>
  );
}
