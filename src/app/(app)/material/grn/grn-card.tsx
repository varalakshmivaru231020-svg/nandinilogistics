import Link from "next/link";

import { Badge } from "@/components/ui/primitives";
import { cn, formatDate, qty } from "@/lib/utils";

/**
 * The design's goods-receipt card. It leads with what actually arrived —
 * accepted, rejected and short as three separate figures — because the whole
 * point of the receipt is that only accepted stock enters the ledger.
 */
export interface GrnCardRow {
  id: string;
  grnNo: string;
  poNo: string;
  poId: string;
  vendor: string;
  grnDate: string;
  store: string;
  lineCount: number;
  challanNo: string | null;
  hasChallanPhoto: boolean;
  inspectedBy: string | null;
  accepted: number;
  rejected: number;
  short: number;
  status: string;
  /** Where this receipt stands in the three-way match. */
  match: { label: string; tone: "good" | "warn" | "bad" | "muted" };
}

const STATUS_TONE: Record<string, "slate" | "brand" | "good" | "warn" | "bad" | "muted"> = {
  DRAFT: "muted", INSPECTED: "warn", POSTED: "good", CANCELLED: "muted",
};

const MATCH_TONE = {
  good: "bg-good-050 text-good-700",
  warn: "bg-warn-050 text-warn-700",
  bad: "bg-bad-050 text-bad-600",
  muted: "bg-surface-field text-muted-600",
} as const;

export function GrnCard({ grn }: { grn: GrnCardRow }) {
  return (
    <div className="flex flex-wrap items-start gap-4 rounded-[13px] border border-line-400 bg-white px-[18px] py-4 transition-shadow hover:shadow-[0_6px_18px_rgba(25,26,92,.07)]">
      <div className="min-w-[190px] flex-[2_1_210px]">
        <Link
          href={`/material/grn/${grn.id}`}
          className="text-[13px] font-bold text-navy-950 transition-colors hover:text-brand-500"
        >
          {grn.grnNo}
        </Link>
        <div className="mt-0.5 text-[11.5px] font-medium text-muted-400">
          against {grn.poNo} · {grn.vendor} · {formatDate(grn.grnDate)}
        </div>
      </div>

      <div className="min-w-[150px] flex-[1_1_170px] text-[12px] font-semibold text-navy-600">
        {grn.lineCount} line{grn.lineCount === 1 ? "" : "s"} · {grn.store}
        <div className="mt-0.5 text-[11px] font-medium text-muted-400">
          {grn.hasChallanPhoto ? "challan photo ✓" : "no challan photo"}
          {grn.challanNo ? ` · challan ${grn.challanNo}` : ""}
          {grn.inspectedBy ? ` · insp. ${grn.inspectedBy}` : " · not inspected"}
        </div>
      </div>

      {/* What arrived, split three ways — the design puts these side by side. */}
      <div className="flex min-w-[180px] flex-[1_1_200px] flex-wrap gap-1.5">
        <span className="num rounded-full bg-good-050 px-[9px] py-[4px] text-[10.5px] font-bold text-good-700">
          Accepted {qty(grn.accepted)}
        </span>
        {grn.rejected > 0 && (
          <span className="num rounded-full bg-bad-050 px-[9px] py-[4px] text-[10.5px] font-bold text-bad-600">
            Rejected {qty(grn.rejected)}
          </span>
        )}
        {grn.short > 0 && (
          <span className="num rounded-full bg-warn-050 px-[9px] py-[4px] text-[10.5px] font-bold text-warn-700">
            Short {qty(grn.short)}
          </span>
        )}
      </div>

      <span
        className={cn(
          "shrink-0 rounded-full px-[10px] py-[5px] text-[10.5px] font-bold",
          MATCH_TONE[grn.match.tone],
        )}
      >
        {grn.match.label}
      </span>

      <div className="flex shrink-0 items-center gap-2.5">
        <Badge tone={STATUS_TONE[grn.status] ?? "slate"}>{grn.status}</Badge>
        <Link
          href={`/material/grn/${grn.id}`}
          className="rounded-[8px] border border-line-400 bg-white px-3 py-1.5 text-[11.5px] font-bold text-brand-700 transition-colors hover:bg-surface-hover"
        >
          View
        </Link>
      </div>
    </div>
  );
}
