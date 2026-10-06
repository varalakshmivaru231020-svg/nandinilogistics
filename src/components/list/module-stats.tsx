import { cn } from "@/lib/utils";
import type { StatFigure } from "@/lib/metrics/figures";

export type { StatFigure };

/**
 * The band of figures a module screen opens with, above its data.
 *
 * Every module answers the same question in the same shape — how much is here,
 * how much is late, how much is waiting on somebody — so the card is one
 * component rather than one per screen. It is the card the Tasks screen already
 * used; the others were drawing their own.
 *
 * Server-rendered: nothing here is interactive, and a figure that needs the
 * clock takes it as a prop rather than reading it during render.
 */

export function Stat({
  value, label, hint, tone,
}: {
  value: string;
  label: string;
  hint?: string;
  tone?: "bad" | "warn" | "good" | "brand";
}) {
  return (
    <div className={cn(
      "rounded-[12px] border px-3.5 py-3",
      tone === "bad" ? "border-bad-300 bg-bad-025"
        : tone === "warn" ? "border-warn-400 bg-warn-050"
          : tone === "good" ? "border-good-400 bg-good-050"
            : tone === "brand" ? "border-brand-500 bg-brand-100"
              : "border-line-400 bg-white",
    )}>
      <div className="num font-display text-[21px] font-extrabold text-navy-950">{value}</div>
      <div className="mt-0.5 text-[11px] font-semibold text-muted-500">{label}</div>
      {hint && <div className="mt-0.5 text-[10.5px] font-medium text-muted-400">{hint}</div>}
    </div>
  );
}

/**
 * The strip itself.
 *
 * It wraps rather than scrolls — a figure pushed off the right-hand edge is a
 * figure nobody reads — and it keeps the same column rhythm whatever the count,
 * so two modules side by side line up.
 */
export function ModuleStats({ figures, className }: { figures: StatFigure[]; className?: string }) {
  if (figures.length === 0) return null;
  return (
    <div
      className={cn(
        "mb-3.5 grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(150px,1fr))]",
        className,
      )}
    >
      {figures.map((f) => <Stat key={f.label} {...f} />)}
    </div>
  );
}
