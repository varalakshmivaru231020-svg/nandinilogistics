"use client";

import * as React from "react";
import { usePathname, useRouter } from "next/navigation";

import { cn } from "@/lib/utils";

export interface BarFilter {
  name: string;
  label: string;
  value: string;
  allLabel: string;
  options: Array<{ value: string; label: string }>;
}

/**
 * The filter row the money screens share: a search box, captioned dropdowns,
 * an optional date range and Clear. Everything lives in the URL so the page,
 * its export and the phone's list read the same query.
 */
export function FilterBar({
  basePath, q, filters, dateRange, searchPlaceholder, children,
}: {
  basePath: string;
  q: string;
  filters: BarFilter[];
  dateRange?: { label: string; from: string; to: string };
  searchPlaceholder: string;
  children?: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();

  const current: Record<string, string> = { q, ...Object.fromEntries(filters.map((f) => [f.name, f.value])) };
  if (dateRange) {
    current.from = dateRange.from;
    current.to = dateRange.to;
  }

  function go(next: Record<string, string | null>) {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...current, ...next })) {
      if (v) params.set(k, v);
    }
    router.push(`${basePath || pathname}${params.toString() ? `?${params}` : ""}`);
  }

  const filtered = Object.values(current).some(Boolean);
  const field = "cursor-pointer rounded-[8px] border border-line-400 bg-surface-sunken px-2.5 py-1.5 text-[11.5px] font-medium text-navy-900";

  return (
    <div className="mb-3.5 flex flex-wrap items-center gap-2.5 rounded-[12px] border border-line-400 bg-white px-3.5 py-[11px]">
      <input
        defaultValue={q}
        onKeyDown={(e) => { if (e.key === "Enter") go({ q: (e.target as HTMLInputElement).value || null }); }}
        onBlur={(e) => { if (e.target.value !== q) go({ q: e.target.value || null }); }}
        placeholder={searchPlaceholder}
        className="w-[260px] rounded-[9px] border border-line-400 bg-surface-sunken px-3 py-2 text-[12px] font-medium text-navy-900 outline-none focus:border-brand-500 focus:bg-white"
      />
      {filters.map((f) => (
        <React.Fragment key={f.name}>
          <span className="text-[11px] font-semibold text-muted-400">{f.label}</span>
          <select value={f.value} onChange={(e) => go({ [f.name]: e.target.value || null })} className={cn(field, "max-w-[190px]")}>
            <option value="">{f.allLabel}</option>
            {f.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </React.Fragment>
      ))}
      {dateRange && (
        <>
          <span className="text-[11px] font-semibold text-muted-400">{dateRange.label}</span>
          <input type="date" value={dateRange.from} onChange={(e) => go({ from: e.target.value || null })} className={field} />
          <span className="text-[11px] font-medium text-muted-400">to</span>
          <input type="date" value={dateRange.to} onChange={(e) => go({ to: e.target.value || null })} className={field} />
        </>
      )}
      {filtered && (
        <button
          type="button"
          onClick={() => go(Object.fromEntries(Object.keys(current).map((k) => [k, null])))}
          className="cursor-pointer text-[11.5px] font-semibold text-brand-700 hover:underline"
        >
          Clear filters
        </button>
      )}
      <div className="flex-1" />
      {children}
    </div>
  );
}

export function Th({ children, className }: { children?: React.ReactNode; className?: string }) {
  return (
    <th className={cn(
      "border-b border-line-150 bg-surface-sunken px-4 py-3 text-left text-[10.5px] font-bold uppercase tracking-[.08em] text-muted-400",
      className,
    )}>
      {children}
    </th>
  );
}

export function Td({ children, className }: { children?: React.ReactNode; className?: string }) {
  return <td className={cn("border-b border-line-150 px-4 py-3 align-top", className)}>{children}</td>;
}

export const PILL: Record<string, string> = {
  good: "bg-good-050 text-good-700",
  warn: "bg-warn-050 text-warn-800",
  bad: "bg-bad-050 text-bad-700",
  info: "bg-brand-100 text-brand-700",
  plum: "bg-plum-050 text-plum-700",
  draft: "bg-surface-field text-navy-600",
};

export function Pill({ tone, children }: { tone: string; children: React.ReactNode }) {
  return (
    <span className={cn("whitespace-nowrap rounded-full px-2.5 py-1 text-[10.5px] font-bold", PILL[tone] ?? PILL.draft)}>
      {children}
    </span>
  );
}
