import "server-only";

import { webTone } from "@/lib/records/shared";
import type { ScreenRow } from "@/lib/screens/rows";
import { formatDate, money } from "@/lib/utils";

/**
 * The material-return row, as `src/app/(app)/material/returns/page.tsx` draws
 * one: the return number with its project and status, how many lines came back
 * damaged, which issue slip it is against, which store it went into, when and
 * why — and the value or the line count, with who raised it.
 *
 * The page imports the tone map from here rather than keeping its own, so the
 * badge on the phone is the badge on the screen.
 */

export const RETURN_STATUS_TONE: Record<string, "warn" | "good" | "bad"> = {
  PENDING: "warn", APPROVED: "good", REJECTED: "bad",
};

export interface ReturnRowInput {
  id: string;
  returnNo: string;
  projectCode: string;
  status: string;
  issueNo: string;
  storeName: string;
  returnDate: Date | string;
  reason: string | null;
  raisedByName: string;
  totalValue: number;
  lineCount: number;
  damagedLines: number;
}

export function returnScreenRow(r: ReturnRowInput, canViewValue: boolean): ScreenRow {
  return {
    id: r.id,
    title: r.returnNo,
    chips: [
      { text: r.projectCode, tone: "draft" },
      { text: r.status, tone: webTone(RETURN_STATUS_TONE[r.status] ?? "warn") },
      ...(r.damagedLines > 0
        ? [{ text: `${r.damagedLines} damaged line(s)`, tone: "draft" as const }]
        : []),
    ],
    meta:
      `Against ${r.issueNo} · into ${r.storeName} · ${formatDate(r.returnDate)}` +
      (r.reason ? ` · ${r.reason}` : ""),
    trailing: {
      value: canViewValue ? money(r.totalValue) : `${r.lineCount} line(s)`,
      label: `raised by ${r.raisedByName}`,
    },
  };
}

export function returnEmpty(filtered: boolean) {
  return {
    title: filtered ? "No returns match these filters" : "No material returns yet",
    description:
      "When a site has material left over, raise a return against the issue slip it came on. " +
      "The store approves it back into stock.",
  };
}
