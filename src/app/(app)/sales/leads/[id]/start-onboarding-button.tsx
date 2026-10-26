"use client";

import * as React from "react";
import Link from "next/link";

import { useToast } from "@/components/ui/toast";
import { startOnboardingFromLeadAction } from "@/app/(app)/hr/actions";

/**
 * SOW §3.1 stage 4: a lead at the Onboarding stage opens the onboarding form.
 * The first press creates the rider's draft from the lead and goes there;
 * once a rider exists the button is a link to them.
 */
export function StartOnboardingButton({
  leadId, rider,
}: {
  leadId: string;
  rider: { id: string; code: string } | null;
}) {
  const toast = useToast();
  const [busy, setBusy] = React.useState(false);

  if (rider) {
    return (
      <Link
        href={`/hr/${rider.id}`}
        className="rounded-[9px] border border-good-200 bg-good-050 px-3.5 py-[9px] text-[12px] font-bold text-good-700 transition-colors hover:brightness-95"
      >
        Rider {rider.code} →
      </Link>
    );
  }

  return (
    <button
      type="button"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        // On success the action redirects to the new rider; only a refusal comes back.
        const res = await startOnboardingFromLeadAction(leadId);
        setBusy(false);
        if (res && !res.ok) toast(res.error, "bad");
      }}
      className="cursor-pointer rounded-[9px] bg-good-600 px-[15px] py-[9px] text-[12px] font-bold text-white transition-colors hover:bg-good-700 disabled:opacity-60"
    >
      {busy ? "Starting…" : "Start onboarding"}
    </button>
  );
}
