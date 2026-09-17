"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { cn } from "@/lib/utils";

/**
 * The design's detail pane. Every "view" screen — indent, purchase order, GRN,
 * item, vendor — is drawn as a sheet laid over the content column: its own
 * header bar with the back button, the reference and its pills, and the row of
 * actions, then a scrolling body. The sidebar stays where it is.
 */
export function DetailScreen({
  backHref,
  title,
  pills,
  subtitle,
  actions,
  children,
}: {
  backHref: string;
  title: React.ReactNode;
  pills?: React.ReactNode;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-y-0 left-0 right-0 z-[92] flex flex-col bg-surface-tint lg:left-[236px]">
      <div className="flex flex-wrap items-center gap-[13px] border-b border-line-400 bg-white px-[26px] py-4">
        <Link
          href={backHref}
          className="shrink-0 whitespace-nowrap rounded-[9px] border border-line-400 bg-white px-3.5 py-[9px] text-[12px] font-semibold text-navy-500 transition-colors hover:border-brand-500 hover:text-brand-700"
        >
          ← Back
        </Link>
        <div className="min-w-[220px] flex-1">
          <div className="flex flex-wrap items-center gap-[9px]">
            <span className="font-display text-[19px] font-bold text-navy-950">{title}</span>
            {pills}
          </div>
          {subtitle && (
            <div className="mt-[3px] text-[12px] font-medium text-muted-500">{subtitle}</div>
          )}
        </div>
        {actions && (
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">{actions}</div>
        )}
      </div>
      <div className="flex-1 overflow-y-auto px-[26px] py-5">{children}</div>
    </div>
  );
}

/*
 * The design gives a solid action no border and an outlined one a pixel on each
 * edge, and pads each so they finish the same height: Edit is 10px/16px, the
 * green step 11px/17px, an outlined one 10px/16px on top of its border.
 */
const ACTION_TONES = {
  /** The blue primary — Edit, Save. */
  primary: "bg-brand-500 px-[17px] py-[11px] text-white hover:bg-brand-600",
  /** The green one — anything that moves stock. */
  success: "bg-good-600 px-[17px] py-[11px] text-white hover:bg-good-700",
  /** The pale blue outline — the sideways step, like raising a PO. */
  soft: "border border-brand-150 bg-brand-100 px-4 py-2.5 text-brand-700 hover:bg-[#CBE5F5]",
  /** The pale red outline — delete. */
  danger: "border border-bad-100 bg-bad-050 px-4 py-2.5 font-semibold text-bad-700 hover:bg-bad-100",
  /** Plain white — a secondary such as Print. */
  plain: "border border-line-400 bg-white px-4 py-2.5 text-navy-500 hover:border-brand-500 hover:text-brand-700",
} as const;

export type ActionTone = keyof typeof ACTION_TONES;

const ACTION_BASE =
  "inline-flex shrink-0 cursor-pointer items-center whitespace-nowrap rounded-[9px] text-[12.5px] font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-60";

/** A header-bar action, as the design draws them. */
export function DetailAction({
  tone = "primary",
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { tone?: ActionTone }) {
  return <button type="button" className={cn(ACTION_BASE, ACTION_TONES[tone], className)} {...props} />;
}

/** The same button as a link, for actions that are really navigation. */
export function DetailActionLink({
  tone = "primary",
  className,
  ...props
}: React.ComponentProps<typeof Link> & { tone?: ActionTone }) {
  return <Link className={cn(ACTION_BASE, ACTION_TONES[tone], className)} {...props} />;
}

/** Sends the viewer back without losing the list's filters, when there is history. */
export function BackAction({ fallback }: { fallback: string }) {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={() => router.push(fallback)}
      className="shrink-0 whitespace-nowrap rounded-[9px] border border-line-400 bg-white px-3.5 py-[9px] text-[12px] font-semibold text-navy-500 transition-colors hover:border-brand-500 hover:text-brand-700"
    >
      ← Back
    </button>
  );
}

/** One of the small labelled cards the design lays across the top of a detail. */
export function SummaryCard({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("rounded-[13px] border border-line-400 bg-white px-5 py-[18px]", className)}>
      <div className="mb-3 text-[11px] font-bold uppercase tracking-[.12em] text-muted-400">{label}</div>
      {children}
    </div>
  );
}

/** A label-over-value pair inside a summary card. */
export function Fact({ label, children, span }: { label: string; children: React.ReactNode; span?: boolean }) {
  return (
    <div className={span ? "col-span-2" : undefined}>
      <div className="text-[10px] font-semibold uppercase tracking-[.06em] text-muted-400">{label}</div>
      <div className="mt-[3px] text-[13px] font-bold text-navy-900">{children}</div>
    </div>
  );
}

/** A full-width card with a titled header — what the design wraps its tables in. */
export function PanelCard({
  title,
  subtitle,
  right,
  children,
  className,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  right?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mt-3.5 overflow-hidden rounded-[13px] border border-line-400 bg-white", className)}>
      <div className="flex flex-wrap items-center gap-2.5 border-b border-line-200 px-5 py-3.5">
        <div className="min-w-[180px] flex-1">
          <div className="font-display text-[13.5px] font-bold text-navy-950">{title}</div>
          {subtitle && (
            <div className="mt-0.5 text-[11.5px] font-medium text-muted-600">{subtitle}</div>
          )}
        </div>
        {right}
      </div>
      {children}
    </div>
  );
}

/** The design's table header cell. */
export const TH =
  "border-b border-line-300 bg-surface-sunken px-3.5 py-[11px] text-[10px] font-bold uppercase tracking-[.08em] text-muted-500";
/** The design's table body cell. */
export const TD = "border-b border-line-150 px-3.5 py-3";

/** The pale pill the design uses inside tables and summary cards. */
export function SoftPill({
  tone,
  className,
  children,
}: {
  tone: "good" | "brand" | "warn" | "bad" | "violet" | "muted";
  className?: string;
  children: React.ReactNode;
}) {
  const tones = {
    good: "bg-good-050 text-good-700",
    brand: "bg-brand-100 text-brand-700",
    warn: "bg-warn-050 text-warn-700",
    bad: "bg-bad-050 text-bad-700",
    violet: "bg-plum-050 text-plum-600",
    muted: "bg-surface-field text-muted-600",
  } as const;
  return (
    <span
      className={cn(
        "inline-flex items-center whitespace-nowrap rounded-full px-[10px] py-[5px] text-[10.5px] font-bold",
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
