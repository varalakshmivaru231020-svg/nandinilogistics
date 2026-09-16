"use client";

import * as React from "react";
import { usePathname } from "next/navigation";

import { screenTitle } from "@/lib/screen-title";

/**
 * The design's screen header: a single muted line on the left, the actions on
 * the right, nothing else.
 *
 *   display:flex; justify-content:space-between; align-items:center;
 *   margin-bottom:15px
 *   description -> font:500 13px 'Public Sans'; color:#7A80A3
 *
 * The screen's name belongs to the topbar in this design, so the heading is
 * dropped whenever the bar is already showing it. Screens the design never
 * drew — and which the bar can only name by their section — keep it, so no
 * screen ends up unnamed.
 */
export function PageHeader({
  title,
  description,
  breadcrumb,
  actions,
}: {
  title: string;
  description?: string;
  breadcrumb?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  const pathname = usePathname();
  const named = screenTitle(pathname) === title;

  return (
    <div className="mb-[15px] flex flex-wrap items-center justify-between gap-3">
      <div className="min-w-0 flex-1">
        {breadcrumb && (
          <div className="mb-1.5 text-[11px] font-semibold text-muted-500">{breadcrumb}</div>
        )}
        {!named && (
          <h1 className="font-display text-[19px] font-extrabold tracking-[-.02em] text-navy-950">
            {title}
          </h1>
        )}
        {description && (
          <p className={`max-w-3xl text-[13px] font-medium text-muted-600 ${named ? "" : "mt-1"}`}>
            {description}
          </p>
        )}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
