"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { useToast } from "@/components/ui/toast";
import type { CheckInCard } from "@/lib/hr/punch";
import { cn } from "@/lib/utils";
import { punchInAction, punchOutAction } from "@/app/(app)/hr/actions";

/** Where the browser says it is — or nulls, when it will not say within a few seconds. */
function locate(): Promise<{ lat: number | null; lng: number | null }> {
  return new Promise((resolve) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      resolve({ lat: null, lng: null });
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => resolve({ lat: null, lng: null }),
      { timeout: 8000, maximumAge: 60_000 },
    );
  });
}

/**
 * Check in / Check out for the signed-in person. The state is the server's,
 * computed once per render of the layout; this only acts on it.
 */
export function CheckInButton({ card, className }: { card: CheckInCard; className?: string }) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = React.useState(false);

  async function act() {
    setBusy(true);
    const { lat, lng } = await locate();
    const res = card.state === "NOT_PUNCHED" ? await punchInAction(lat, lng) : await punchOutAction(lat, lng);
    setBusy(false);
    if (!res.ok) { toast(res.error, "bad"); return; }
    toast(
      (card.state === "NOT_PUNCHED" ? "Checked in" : "Checked out") + (lat === null ? " — no location shared" : ""),
    );
    router.refresh();
  }

  if (card.state === "PUNCHED_OUT") {
    return (
      <span className={cn("rounded-[9px] border border-line-400 bg-surface-field px-3 py-2 text-[11.5px] font-bold text-muted-500", className)}>
        Checked out {card.outAt}
      </span>
    );
  }
  const checkingIn = card.state === "NOT_PUNCHED";
  return (
    <button
      type="button"
      onClick={act}
      disabled={busy}
      className={cn(
        "rounded-[9px] px-3 py-2 text-[11.5px] font-bold text-white transition-colors disabled:opacity-60",
        checkingIn ? "bg-good-600 hover:bg-good-700" : "bg-navy-950 hover:bg-navy-700",
        className,
      )}
    >
      {busy ? "…" : checkingIn ? "Check in" : `Check out · In since ${card.inAt}`}
    </button>
  );
}
