import "server-only";

import type { RecordAction } from "@/lib/records/types";
import type { ScreenRow } from "@/lib/screens/rows";
import { bikeRentRunning } from "@/lib/advances/list-display";
import { formatDate, money } from "@/lib/utils";

export { BIKE_RENT_EMPTY } from "@/lib/advances/list-display";

/** A bike assignment, as `bike-rent-screen.tsx` draws one. */
export interface BikeRentRowInput {
  id: string;
  riderCode: string;
  riderName: string;
  bikeNumber: string;
  rentPerWeek: number;
  startDate: Date | string;
  endDate: Date | string | null;
  notes: string | null;
}

export function bikeRentDecisions(
  r: { id: string; endDate: Date | string | null },
  today: string,
  can: { update: boolean; remove: boolean },
): RecordAction[] {
  const actions: RecordAction[] = [];
  if (can.update) {
    // Editing an assignment is done on the web admin panel.
    if (bikeRentRunning(r.endDate, today)) {
      actions.push({
        key: "end",
        label: "End assignment",
        emphasis: "reject",
        action: "advances/endBikeRent",
        args: [r.id, "$endDate"],
        remark: "none",
        fields: [{ name: "endDate", label: "Last day", kind: "date", required: true, initial: today }],
        confirm: "Rent stops being deducted after this day.",
      });
    }
  }
  if (can.remove) {
    actions.push({
      key: "delete",
      label: "Delete",
      emphasis: "reject",
      action: "advances/deleteBikeRent",
      args: [r.id],
      remark: "none",
      confirm: "Payouts already posted keep the rent they deducted.",
    });
  }
  return actions;
}

export function bikeRentScreenRow(r: BikeRentRowInput, today: string, actions: RecordAction[] = []): ScreenRow {
  const running = bikeRentRunning(r.endDate, today);
  return {
    id: r.id,
    title: `${r.bikeNumber} · ${r.riderName}`,
    meta: r.riderCode,
    lines: [
      { label: "From", value: formatDate(r.startDate) + (r.endDate ? ` to ${formatDate(r.endDate)}` : " · running") },
      ...(r.notes ? [{ label: "Notes", value: r.notes }] : []),
    ],
    trailing: { value: money(r.rentPerWeek), label: "per week" },
    status: running ? { label: "Running", tone: "info" } : { label: "Ended", tone: "draft" },
    actions,
  };
}
