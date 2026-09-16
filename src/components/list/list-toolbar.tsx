"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { Input, Select } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";

export interface ListFilter {
  /** URL parameter, e.g. "status". */
  name: string;
  label: string;
  options: Array<{ value: string; label: string }>;
  /** The "everything" option; the design writes it "All". */
  allLabel?: string;
}

/**
 * The design's filter row: search, an optional date range, captioned
 * dropdowns, the count, and Clear once something is applied.
 *
 *   background:#FFFFFF; border:1px solid #E3E7F2; border-radius:12px;
 *   padding:11px 14px; gap:9px
 *
 * Everything lives in the URL, so pagination, counts and the export (which
 * reads the same URL) all agree with what is on screen. Parameters: `q` for
 * search, each filter's `name`, `from`/`to` for the range. Changing any of
 * them drops `page`.
 */
export function ListToolbar({
  searchPlaceholder = "Search…",
  filters = [],
  dateRange,
  count,
  countNoun,
  children,
  className,
}: {
  /** Pass null for a list with no text search. */
  searchPlaceholder?: string | null;
  filters?: ListFilter[];
  /** Shows From/To. The design captions them "From" and "To". */
  dateRange?: { label: string };
  /** Rows matching. The design writes it "12 indents", not "12 shown". */
  count?: number;
  countNoun?: string;
  /** Actions on the right, on the screens whose design draws them. */
  children?: React.ReactNode;
  className?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = React.useTransition();

  function set(next: Record<string, string | undefined>) {
    const sp = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(next)) {
      if (!v || v === "all") sp.delete(k);
      else sp.set(k, v);
    }
    sp.delete("page");
    const qs = sp.toString();
    startTransition(() => router.push(qs ? `${pathname}?${qs}` : pathname));
  }

  const keys = [
    ...(searchPlaceholder !== null ? ["q"] : []),
    ...(dateRange ? ["from", "to"] : []),
    ...filters.map((f) => f.name),
  ];
  const active = keys.some((k) => params.get(k));
  const q = params.get("q") ?? "";

  return (
    <div
      className={cn(
        "mb-3.5 flex flex-wrap items-center gap-[9px] rounded-[12px] border border-line-400 bg-white px-3.5 py-[11px] transition-opacity",
        pending && "opacity-70",
        className,
      )}
    >
      {searchPlaceholder !== null && (
        <form
          // Keyed on the applied search, so the box resets when the URL does.
          key={q}
          role="search"
          onSubmit={(e) => {
            e.preventDefault();
            set({ q: String(new FormData(e.currentTarget).get("q") ?? "").trim() });
          }}
          className="min-w-[230px] flex-1"
        >
          <Input name="q" defaultValue={q} placeholder={searchPlaceholder} aria-label="Search" />
        </form>
      )}

      {dateRange && (
        <>
          <Caption>From</Caption>
          <Input
            type="date"
            key={`from-${params.get("from") ?? ""}`}
            aria-label={`${dateRange.label} from`}
            defaultValue={params.get("from") ?? ""}
            onChange={(e) => set({ from: e.target.value })}
            className="w-auto cursor-pointer"
          />
          <Caption>To</Caption>
          <Input
            type="date"
            key={`to-${params.get("to") ?? ""}`}
            aria-label={`${dateRange.label} to`}
            defaultValue={params.get("to") ?? ""}
            onChange={(e) => set({ to: e.target.value })}
            className="w-auto cursor-pointer"
          />
        </>
      )}

      {filters.map((f) => (
        <React.Fragment key={f.name}>
          <Caption>{f.label}</Caption>
          <Select
            aria-label={f.label}
            value={params.get(f.name) ?? "all"}
            onChange={(e) => set({ [f.name]: e.target.value })}
            className="w-auto cursor-pointer"
          >
            <option value="all">{f.allLabel ?? "All"}</option>
            {f.options.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </Select>
        </React.Fragment>
      ))}

      {count !== undefined && (
        <span className="text-[11.5px] font-medium text-muted-600">
          {count.toLocaleString("en-IN")} {countNoun ?? "shown"}
        </span>
      )}

      {active && (
        <button
          type="button"
          onClick={() => set(Object.fromEntries(keys.map((k) => [k, undefined])))}
          className="rounded-[8px] border border-bad-100 bg-bad-050 px-3 py-[7px] text-[11.5px] font-semibold text-bad-700 hover:brightness-95"
        >
          Clear
        </button>
      )}

      {children}
    </div>
  );
}

/** The small muted caption the design puts before each control. */
function Caption({ children }: { children: React.ReactNode }) {
  return <span className="text-[11px] font-semibold text-muted-400">{children}</span>;
}
