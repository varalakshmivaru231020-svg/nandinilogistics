import * as React from "react";

import { cn } from "@/lib/utils";
import { EmptyState } from "./primitives";

/**
 * Presentational data table. Deliberately NOT a client component, so `render`
 * callbacks can be written inside server components and read straight from the
 * database result without a serialisation dance.
 */

export interface Column<T> {
  key: string;
  header: React.ReactNode;
  align?: "left" | "right" | "center";
  className?: string;
  headerClassName?: string;
  /** Column is only rendered when this returns true — used for FIELD permissions. */
  visible?: boolean;
  render: (row: T, index: number) => React.ReactNode;
}

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  empty,
  dense = false,
  className,
  footer,
}: {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T, index: number) => string;
  empty?: React.ReactNode;
  dense?: boolean;
  className?: string;
  footer?: React.ReactNode;
}) {
  const cols = columns.filter((c) => c.visible !== false);

  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-slate-200 bg-white">
        {empty ?? <EmptyState title="Nothing here yet" description="No records match the current filter." />}
      </div>
    );
  }

  const align = { left: "text-left", right: "text-right", center: "text-center" };

  return (
    <div className={cn("scroll-thin overflow-x-auto rounded-lg border border-slate-200 bg-white", className)}>
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50">
            {cols.map((c) => (
              <th
                key={c.key}
                className={cn(
                  "whitespace-nowrap px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-600",
                  align[c.align ?? "left"],
                  c.headerClassName,
                )}
              >
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr
              key={rowKey(row, i)}
              className="border-b border-slate-100 last:border-0 hover:bg-slate-50/70"
            >
              {cols.map((c) => (
                <td
                  key={c.key}
                  className={cn(
                    dense ? "px-3 py-1.5" : "px-3 py-2.5",
                    "text-slate-700",
                    align[c.align ?? "left"],
                    c.className,
                  )}
                >
                  {c.render(row, i)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
        {footer && <tfoot className="border-t-2 border-slate-200 bg-slate-50 font-medium">{footer}</tfoot>}
      </table>
    </div>
  );
}

/** Simple offset pagination bar driven by search params. */
export function Pagination({
  page,
  pageSize,
  total,
  buildHref,
}: {
  page: number;
  pageSize: number;
  total: number;
  buildHref: (page: number) => string;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (total === 0) return null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  return (
    <div className="flex items-center justify-between gap-3 px-1 py-2 text-xs text-slate-600">
      <span className="num">
        Showing {from}–{to} of {total.toLocaleString("en-IN")}
      </span>
      <div className="flex items-center gap-1">
        <a
          href={buildHref(Math.max(1, page - 1))}
          aria-disabled={page <= 1}
          className={cn(
            "rounded border border-slate-300 bg-white px-2 py-1",
            page <= 1 ? "pointer-events-none opacity-40" : "hover:bg-slate-50",
          )}
        >
          Previous
        </a>
        <span className="px-2 num">
          Page {page} of {pages}
        </span>
        <a
          href={buildHref(Math.min(pages, page + 1))}
          aria-disabled={page >= pages}
          className={cn(
            "rounded border border-slate-300 bg-white px-2 py-1",
            page >= pages ? "pointer-events-none opacity-40" : "hover:bg-slate-50",
          )}
        >
          Next
        </a>
      </div>
    </div>
  );
}
