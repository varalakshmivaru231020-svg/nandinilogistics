import "server-only";

import type { ScreenRow } from "@/lib/screens/rows";
import { formatDate, money } from "@/lib/utils";

/**
 * The issue-slip row, as `issues-screen.tsx` draws one: the slip number with
 * its project, whether it has been acknowledged, whether part of it has come
 * back and whether returns are pending — then where it went, to whom, when,
 * against which work package and for what, with the value or the line count at
 * the end and who issued it.
 */

export interface IssueRowInput {
  id: string;
  issueNo: string;
  projectCode: string;
  storeName: string;
  issuedToName: string;
  issuedByName: string;
  issueDate: Date | string;
  workPackage: string | null;
  purpose: string | null;
  totalValue: number;
  lineCount: number;
  returnedQty: number;
  pendingReturns: number;
  acknowledgedAt: Date | string | null;
  cancelledAt: Date | string | null;
}

export function issueScreenRow(i: IssueRowInput, canViewValue: boolean): ScreenRow {
  const cancelled = Boolean(i.cancelledAt);
  return {
    id: i.id,
    title: i.issueNo,
    chips: [
      { text: i.projectCode, tone: "draft" },
      cancelled
        ? { text: "Cancelled", tone: "bad" as const }
        : i.acknowledgedAt
          ? { text: "Acknowledged", tone: "good" as const }
          : { text: "Awaiting acknowledgement", tone: "warn" as const },
      ...(i.returnedQty > 0 ? [{ text: "Part returned", tone: "draft" as const }] : []),
      ...(i.pendingReturns > 0
        ? [{ text: `${i.pendingReturns} return(s) pending`, tone: "warn" as const }]
        : []),
    ],
    meta:
      `${i.storeName} → ${i.issuedToName} · ${formatDate(i.issueDate)}` +
      (i.workPackage ? ` · ${i.workPackage}` : "") +
      (i.purpose ? ` · ${i.purpose}` : ""),
    trailing: {
      value: canViewValue ? money(i.totalValue) : `${i.lineCount} line(s)`,
      label: `issued by ${i.issuedByName}`,
    },
  };
}

export function issueEmpty(filtered: boolean) {
  return {
    title: filtered ? "No issue slips match these filters" : "Nothing issued yet",
    description:
      "Issuing material moves it out of the store ledger and onto a work package, so consumption " +
      "can be compared with what was indented.",
  };
}
