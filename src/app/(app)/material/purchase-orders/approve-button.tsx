"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { cn } from "@/lib/utils";
import { approvePoAdminAction, approvePoPmAction } from "./actions";

/**
 * The design approves a purchase order from the list itself — amber while it
 * waits on the Project Manager, purple while it waits on Admin.
 */
export function PoApproveButton({ id, level }: { id: string; level: "PM" | "ADMIN" }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function approve() {
    setBusy(true);
    const res =
      level === "ADMIN"
        ? await approvePoAdminAction(id, "Approved from the purchase order list")
        : await approvePoPmAction(id, "Approved from the purchase order list");
    setBusy(false);
    if (!res.ok) { setError(res.error); return; }
    setError(null);
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={approve}
      disabled={busy}
      title={error ?? undefined}
      className={cn(
        "cursor-pointer whitespace-nowrap rounded-[7px] px-[11px] py-1.5 text-[10.5px] font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-60",
        level === "ADMIN" ? "bg-[#6A46C8]" : "bg-[#E8A13A]",
        error && "bg-bad-600",
      )}
    >
      {error ? "✕ Failed" : level === "ADMIN" ? "✓ Admin approve" : "✓ PM approve"}
    </button>
  );
}
