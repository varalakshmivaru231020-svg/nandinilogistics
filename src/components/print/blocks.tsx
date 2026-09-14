import { cn } from "@/lib/utils";
import { rupeesInWords } from "@/lib/material/procurement";

/** Building blocks shared by the printed documents. Server components; nothing here reads the clock. */

/** A full-width notice under the heading: "Cancelled", "Not approved". */
export function PrintBanner({ tone, children }: { tone: "warn" | "bad"; children: React.ReactNode }) {
  return (
    <p
      className={cn(
        "print-keep mt-3 rounded border px-3 py-1.5 text-center text-[11px] font-bold uppercase tracking-wider",
        tone === "warn" ? "border-warn-700 text-warn-700" : "border-bad-600 text-bad-600",
      )}
    >
      {children}
    </p>
  );
}

/** The small caps label above a section. */
export function SectionLabel({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <p className={cn("text-[10px] font-bold uppercase tracking-wider text-muted-500", className)}>{children}</p>
  );
}

/** A bordered party or facts box: "Vendor", "Deliver to", "Customer". */
export function PrintBox({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded border border-line-400 p-3">
      <SectionLabel>{label}</SectionLabel>
      {children}
    </div>
  );
}

/** Label / value pairs inside a box. Rows whose value is `false` are left out. */
export function FactList({ rows }: { rows: Array<[label: string, value: React.ReactNode] | false | null> }) {
  return (
    <dl className="mt-1.5 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
      {rows.filter((r): r is [string, React.ReactNode] => Boolean(r)).map(([label, value]) => (
        <div key={label} className="contents">
          <dt className="text-muted-600">{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function AmountInWords({ amount, className }: { amount: number; className?: string }) {
  return (
    <p className={cn("text-[11px]", className)}>
      <span className="text-muted-600">Amount in words: </span>
      <span className="font-semibold">{rupeesInWords(amount)}</span>
    </p>
  );
}

const GRID_COLS: Record<number, string> = {
  1: "grid-cols-1", 2: "grid-cols-2", 3: "grid-cols-3", 4: "grid-cols-4",
};

/** Signature lines with the signer's role and, where known, name. */
export function SignatureBlocks({
  blocks, className,
}: {
  blocks: Array<{ role: string; name?: string | null }>;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "print-keep mt-10 grid gap-6 text-center text-[10.5px]",
        GRID_COLS[Math.min(4, Math.max(1, blocks.length))],
        className,
      )}
    >
      {blocks.map((b) => (
        <div key={b.role}>
          <div className="h-12 border-b border-navy-950" />
          <p className="mt-1 font-semibold">{b.role}</p>
          <p className="text-muted-600">{b.name || " "}</p>
        </div>
      ))}
    </section>
  );
}
