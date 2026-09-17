import Link from "next/link";

import { Badge } from "@/components/ui/primitives";
import { cn, formatDate } from "@/lib/utils";
import {
  chainStage, INDENT_CHAIN, INDENT_STATUS_LABEL, INDENT_STATUS_TONE,
  indentFulfilment, type FulfilLine,
} from "@/lib/material/indent-fulfilment";

const FULFIL_TONE = {
  good: "bg-good-600 text-white",
  brand: "bg-brand-500 text-white",
  amber: "bg-amber-500 text-white",
} as const;

export function IndentCard({
  indent,
}: {
  indent: {
    id: string; indentNo: string; title: string; project: string; raisedBy: string;
    raisedAt: string; requiredBy: string | null; activity: string | null;
    status: string; lines: FulfilLine[];
  };
}) {
  const stage = chainStage(indent.status);
  const fulfil = indentFulfilment(indent.lines);
  const stopped = indent.status === "REJECTED" || indent.status === "CANCELLED";

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
      <div className="flex shrink-0 items-center gap-[5px]">
        {INDENT_CHAIN.map((step, i) => {
          const done = !stopped && i < stage;
          const now = !stopped && i === stage;
          return (
            <span key={step.short} className="flex items-center gap-[5px]">
              <span
                title={step.name}
                className={cn(
                  "inline-block rounded-md px-1.5 py-1 text-[9px] font-extrabold",
                  done && "bg-good-600 text-white",
                  now && "bg-amber-500 text-white",
                  !done && !now && "bg-line-200 text-muted-400",
                )}
              >
                {step.short}
              </span>
              {i < INDENT_CHAIN.length - 1 && <span className="h-0.5 w-3.5 bg-line-500" />}
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
        <Badge tone={INDENT_STATUS_TONE[indent.status] ?? "slate"}>
          {INDENT_STATUS_LABEL[indent.status] ?? indent.status}
        </Badge>
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
