"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search, X } from "lucide-react";

import { Input, Select } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";

export interface ListFilter {
  /** URL parameter, e.g. "status". */
  name: string;
  label: string;
  options: Array<{ value: string; label: string }>;
  /** The "everything" option; defaults to "All <label>". */
  allLabel?: string;
}

/**
 * Search, filters and a date range for a list, kept in the URL.
 *
 * The page reads the parameters and filters on the server — so pagination,
 * counts and the export (which reads the same URL) all agree with what is on
 * screen. Parameters: `q` for search, each filter's `name`, `from`/`to` for
 * the range. Changing any of them drops `page`.
 */
export function ListToolbar({
  searchPlaceholder = "Search…",
  filters = [],
  dateRange,
  count,
  children,
  className,
}: {
  /** Pass null for a list with no text search. */
  searchPlaceholder?: string | null;
  filters?: ListFilter[];
  /** Shows From/To, e.g. { label: "Booked" }. */
  dateRange?: { label: string };
  /** Rows matching, shown on the right. */
  count?: number;
  /** Actions on the right — typically the export menu. */
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
        "mb-3 flex flex-wrap items-center gap-2 rounded-[12px] border border-line-400 bg-white px-3 py-2.5 transition-opacity",
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
          className="relative min-w-52 flex-1 sm:max-w-xs"
        >
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-400" />
          <Input name="q" defaultValue={q} placeholder={searchPlaceholder} aria-label="Search" className="bg-white pl-8" />
        </form>
      )}

      {filters.map((f) => (
        <Select
          key={f.name}
          aria-label={f.label}
          value={params.get(f.name) ?? "all"}
          onChange={(e) => set({ [f.name]: e.target.value })}
          className="w-auto min-w-36 bg-white"
        >
          <option value="all">{f.allLabel ?? `All ${f.label.toLowerCase()}`}</option>
          {f.options.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </Select>
      ))}

      {dateRange && (
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] font-semibold text-muted-400">{dateRange.label}</span>
          <Input
            type="date"
            key={`from-${params.get("from") ?? ""}`}
            aria-label={`${dateRange.label} from`}
            defaultValue={params.get("from") ?? ""}
            onChange={(e) => set({ from: e.target.value })}
            className="w-auto bg-white"
          />
          <span className="text-muted-400">–</span>
          <Input
            type="date"
            key={`to-${params.get("to") ?? ""}`}
            aria-label={`${dateRange.label} to`}
            defaultValue={params.get("to") ?? ""}
            onChange={(e) => set({ to: e.target.value })}
            className="w-auto bg-white"
          />
        </div>
      )}

      {active && (
        <button
          type="button"
          onClick={() => set(Object.fromEntries(keys.map((k) => [k, undefined])))}
          className="inline-flex items-center gap-1 rounded-[8px] border border-bad-050 bg-bad-050 px-2.5 py-1.5 text-[11.5px] font-semibold text-bad-600 hover:brightness-95"
        >
          <X className="h-3 w-3" />
          Clear
        </button>
      )}

      <div className="flex-1" />
      {count !== undefined && (
        <span className="text-[11.5px] font-semibold text-muted-600">{count.toLocaleString("en-IN")} shown</span>
      )}
      {children}
    </div>
  );
}
