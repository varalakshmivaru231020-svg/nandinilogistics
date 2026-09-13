"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Card, Field, Input } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { ASSIGNMENT_MODE_LABEL, ASSIGNMENT_MODES, type AssignmentMode } from "@/lib/sales/assignment";
import { updateEscalationHoursAction, updateLeadAssignmentModeAction } from "./actions";

export function SettingsScreen({
  assignmentMode, escalationHours, canUpdate,
}: {
  assignmentMode: AssignmentMode;
  escalationHours: number;
  canUpdate: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [mode, setMode] = React.useState<AssignmentMode>(assignmentMode);
  const [hours, setHours] = React.useState(String(escalationHours));
  const [busy, setBusy] = React.useState<"mode" | "hours" | null>(null);

  async function saveMode() {
    setBusy("mode");
    const res = await updateLeadAssignmentModeAction(mode);
    setBusy(null);
    if (!res.ok) { toast(res.error, "bad"); return; }
    toast("Lead assignment updated");
    router.refresh();
  }

  async function saveHours() {
    setBusy("hours");
    const res = await updateEscalationHoursAction(Number(hours));
    setBusy(null);
    if (!res.ok) { toast(res.error, "bad"); return; }
    toast("Escalation grace period updated");
    router.refresh();
  }

  return (
    <div className="space-y-3.5">
      <Card className="px-5 py-4">
        <h2 className="font-display text-[15px] font-bold text-navy-950">Lead assignment</h2>
        <p className="mt-1 text-[12px] font-medium text-muted-600">
          Who a new lead goes to the moment it is captured. Automatic modes share leads among everyone
          holding the “Receive auto-assigned leads” permission.
        </p>

        <div className="mt-3 space-y-1.5">
          {ASSIGNMENT_MODES.map((m) => (
            <label
              key={m}
              className={cn(
                "flex cursor-pointer items-center gap-2.5 rounded-[10px] border px-3 py-2.5 transition-colors",
                mode === m ? "border-brand-500 bg-brand-100" : "border-line-300 bg-white hover:bg-surface-hover",
                !canUpdate && "cursor-not-allowed opacity-70",
              )}
            >
              <input
                type="radio"
                name="assignment-mode"
                value={m}
                checked={mode === m}
                disabled={!canUpdate}
                onChange={() => setMode(m)}
              />
              <span className="text-[12.5px] font-semibold text-navy-900">{ASSIGNMENT_MODE_LABEL[m]}</span>
            </label>
          ))}
        </div>

        {canUpdate && (
          <div className="mt-3 flex justify-end">
            <Button onClick={saveMode} loading={busy === "mode"} disabled={mode === assignmentMode}>
              Save assignment rule
            </Button>
          </div>
        )}
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
            <Button onClick={saveHours} loading={busy === "hours"} disabled={Number(hours) === escalationHours}>
              Save grace period
            </Button>
          )}
        </div>
      </Card>
    </div>
  );
}
