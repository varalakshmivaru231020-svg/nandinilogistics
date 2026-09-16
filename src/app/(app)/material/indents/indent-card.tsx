import Link from "next/link";

import { Badge } from "@/components/ui/primitives";
import { cn, formatDate } from "@/lib/utils";

/**
 * The design's approval chain, shown on every indent: raised on site, then the
 * two approval levels, the store's stock check, and the purchase order.
 */
const CHAIN_STEPS = [
  { key: "RAISED", short: "R", name: "Raised on site" },
  { key: "PM", short: "PM", name: "Project Manager approval" },
  { key: "ADMIN", short: "AD", name: "Owner / Admin approval" },
  { key: "STORE", short: "ST", name: "Store stock check" },
  { key: "PO", short: "PO", name: "Purchase order raised" },
];

/** How far along the chain a status has reached. */
export function chainStage(status: string): number {
  switch (status) {
    case "DRAFT": return 0;
    case "SUBMITTED": return 1;
    case "PM_APPROVED": return 2;
    case "ADMIN_APPROVED": return 3;
    case "PARTIALLY_ORDERED": return 4;
    case "ORDERED":
    case "CLOSED": return 5;
    default: return 1;
  }
}

export interface IndentLine {
  requestedQty: number;
  approvedQty: number | null;
  issueFromStockQty: number;
  toPurchaseQty: number;
}

/**
 * The design's four fulfilment states, which say what will actually happen to
 * an indent rather than only where its approval has got to.
 */
export function fulfilment(lines: IndentLine[]) {
  const n = lines.length;
  const lineTxt = (k: number) => `${k} ${k === 1 ? "line" : "lines"}`;

  const issued = lines.filter((l) => l.issueFromStockQty > 0 && l.toPurchaseQty === 0).length;
  const needsPo = lines.filter((l) => l.toPurchaseQty > 0).length;
  const issuable = lines.filter((l) => l.issueFromStockQty > 0).length;
  const complete = n > 0 && needsPo === 0 && issued === n;

  if (complete) {
    return { label: "FULLY ISSUED", tone: "good" as const, text: `All ${lineTxt(n)} issued to site in full` };
  }
  if (needsPo === 0) {
    return {
      label: "ISSUE FROM STOCK", tone: "good" as const,
      text: `${issued} of ${lineTxt(n)} issued · balance available in stock, no PO needed`,
    };
  }
  if (issuable > 0) {
    return {
      label: "PART ISSUE + PO", tone: "brand" as const,
      text: `${issued} of ${lineTxt(n)} issued · ${lineTxt(issuable)} issuable now · ${lineTxt(needsPo)} ${needsPo === 1 ? "needs" : "need"} a PO`,
    };
  }
  return {
    label: "SHORTFALL → PO", tone: "warn" as const,
    text: `${issued} of ${lineTxt(n)} issued · ${lineTxt(needsPo)} ${needsPo === 1 ? "is" : "are"} not in stock — PO required`,
  };
}

const FULFIL_TONE = {
  good: "bg-good-600 text-white",
  brand: "bg-brand-500 text-white",
  warn: "bg-[#E8A13A] text-white",
} as const;

/** The design writes these in words, not in enum case. */
const STATUS_LABEL: Record<string, string> = {
  DRAFT: "Draft", SUBMITTED: "Pending PM approval", PM_APPROVED: "Pending approval",
  ADMIN_APPROVED: "Approved", PARTIALLY_ORDERED: "Part-issued", ORDERED: "Issued",
  CLOSED: "Closed", REJECTED: "Rejected", CANCELLED: "Cancelled",
};

const STATUS_TONE: Record<string, "slate" | "brand" | "good" | "warn" | "bad" | "violet" | "muted"> = {
  DRAFT: "muted", SUBMITTED: "warn", PM_APPROVED: "warn", ADMIN_APPROVED: "brand",
  PARTIALLY_ORDERED: "violet", ORDERED: "good", CLOSED: "good",
  REJECTED: "bad", CANCELLED: "muted",
};

export function IndentCard({
  indent,
}: {
  indent: {
    id: string; indentNo: string; title: string; project: string; raisedBy: string;
    raisedAt: string; requiredBy: string | null; activity: string | null;
    status: string; lines: IndentLine[];
    /** Days waiting, when the viewer may see ageing. Null hides it. */
    waitingDays: number | null;
  };
}) {
  const stage = chainStage(indent.status);
  const fulfil = fulfilment(indent.lines);
  const rejected = indent.status === "REJECTED" || indent.status === "CANCELLED";

  return (
    <div className="flex flex-wrap items-center gap-4 border-b border-line-200 px-[18px] py-3.5 last:border-0 hover:bg-surface-tint">
      {/* What was asked for */}
      <div className="min-w-[200px] flex-[2_1_220px]">
        <Link
          href={`/material/indents/${indent.id}`}
          className="text-[13.5px] font-bold text-navy-950 transition-colors hover:text-brand-500"
        >
          {indent.title}
        </Link>
        <div className="mt-0.5 text-[11.5px] font-medium text-muted-400">
          {indent.indentNo} · {indent.project} · by {indent.raisedBy} · raised {formatDate(indent.raisedAt)}
        </div>
      </div>

      {/* When, and what for */}
      <div className="min-w-[130px] flex-[1_1_140px] text-[11.5px] font-medium text-muted-500">
        Required by <b className="font-bold text-navy-900">{indent.requiredBy ? formatDate(indent.requiredBy) : "—"}</b>
        <div className="mt-0.5 truncate" title={indent.activity ?? ""}>{indent.activity ?? "—"}</div>
      </div>

      {/* The approval chain */}
      <div className="flex shrink-0 items-center gap-1">
        {CHAIN_STEPS.map((step, i) => {
          const reached = !rejected && i < stage;
          const current = !rejected && i === stage;
          return (
            <span key={step.key} className="flex items-center gap-1">
              <span
                title={step.name}
                className={cn(
                  "grid h-[22px] min-w-[22px] place-items-center rounded-full px-1 text-[9px] font-extrabold",
                  reached && "bg-good-600 text-white",
                  current && "bg-brand-500 text-white",
                  !reached && !current && "bg-surface-field text-muted-400",
                )}
              >
                {step.short}
              </span>
              {i < CHAIN_STEPS.length - 1 && (
                <span className={cn("h-px w-2.5", reached ? "bg-good-600" : "bg-line-400")} />
              )}
            </span>
          );
        })}
      </div>

      {/* What will actually happen to it */}
      <div className="min-w-[160px] flex-[1_1_180px]">
        <span
          className={cn(
            "inline-flex rounded-full px-[9px] py-[4px] text-[8.5px] font-extrabold uppercase tracking-[.07em]",
            FULFIL_TONE[fulfil.tone],
          )}
        >
          {fulfil.label}
        </span>
        <div className="mt-1 text-[11px] font-medium leading-relaxed text-muted-500">{fulfil.text}</div>
      </div>

      <div className="flex shrink-0 items-center gap-2.5">
        <Badge tone={STATUS_TONE[indent.status] ?? "slate"}>{STATUS_LABEL[indent.status] ?? indent.status}</Badge>
        <Link
          href={`/material/indents/${indent.id}`}
          className="rounded-[7px] bg-brand-500 px-[11px] py-1.5 text-[10.5px] font-bold text-white transition-colors hover:bg-brand-600"
        >
          View
        </Link>
      </div>
    </div>
  );
}
