"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Card, Field, Input } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { updateEscalationHoursAction } from "./actions";

export function SettingsScreen({
  escalationHours, canUpdate,
}: {
  escalationHours: number;
  canUpdate: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [hours, setHours] = React.useState(String(escalationHours));
  const [busy, setBusy] = React.useState(false);

  async function saveHours() {
    setBusy(true);
    const res = await updateEscalationHoursAction(Number(hours));
    setBusy(false);
    if (!res.ok) { toast(res.error, "bad"); return; }
    toast("Escalation grace period updated");
    router.refresh();
  }

  return (
    <div className="space-y-3.5">
      <Card className="px-5 py-4">
        <h2 className="font-display text-[15px] font-bold text-navy-950">Lead assignment</h2>
        <p className="mt-1 text-[12px] font-medium text-muted-600">
          Admin and Team Leaders choose the tele-caller when they create a lead. A tele-caller owns the
          leads they capture. A lead a rider refers from the app goes round-robin to the tele-callers —
          whoever holds the “Receive auto-assigned leads” permission.
        </p>
      </Card>

      <Card className="px-5 py-4">
        <h2 className="font-display text-[15px] font-bold text-navy-950">Follow-up escalation</h2>
        <p className="mt-1 text-[12px] font-medium text-muted-600">
          How long a lead&apos;s follow-up can stay overdue before everyone holding “Receive overdue
          follow-up escalations” is notified. Each lapse escalates once; logging a follow-up starts afresh.
        </p>

        <div className="mt-3 flex flex-wrap items-end gap-2.5">
          <Field label="Grace period (hours)" className="w-[180px]">
            <Input
              type="number"
              min={1}
              max={720}
              step={1}
              value={hours}
              disabled={!canUpdate}
              onChange={(e) => setHours(e.target.value)}
            />
          </Field>
          {canUpdate && (
            <Button onClick={saveHours} loading={busy} disabled={Number(hours) === escalationHours}>
              Save grace period
            </Button>
          )}
        </div>
      </Card>
    </div>
  );
}
