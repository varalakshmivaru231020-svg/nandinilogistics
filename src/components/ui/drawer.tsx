"use client";

import * as React from "react";
import { createPortal } from "react-dom";

import { cn } from "@/lib/utils";
import { lockAppScroll } from "@/lib/scroll-lock";

/**
 * The design's right-hand panel, used wherever a record is created or built:
 *
 *   backdrop  position:fixed; inset:0; background:rgba(25,26,92,.38); z-index:80
 *   panel     position:fixed; top/right/bottom:0; width:560px; max-width:94vw;
 *             z-index:81; box-shadow:-24px 0 60px rgba(25,26,92,.2);
 *             animation:slideIn .3s ease both
 *
 * Portalled to <body>, so a page wrapper with a transform cannot become its
 * containing block and clip it.
 */
/* The widths the design uses: capture a lead at 460, a record at 520, a build
 * at 560, and the wider sheets beyond that. */
const WIDTHS = {
  sm: "w-[460px]",
  base: "w-[520px]",
  md: "w-[560px]",
  lg: "w-[720px]",
  xl: "w-[880px]",
} as const;

export function Drawer({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = "md",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  size?: keyof typeof WIDTHS;
}) {
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const unlock = lockAppScroll();
    return () => {
      document.removeEventListener("keydown", onKey);
      unlock();
    };
  }, [open, onClose]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <>
      <div
        onClick={onClose}
        className="fixed inset-0 z-[80] bg-[rgba(25,26,92,.38)]"
        aria-hidden="true"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cn(
          "animate-slide-in fixed inset-y-0 right-0 z-[81] flex max-w-[94vw] flex-col bg-white",
          "shadow-[-24px_0_60px_rgba(25,26,92,.2)]",
          WIDTHS[size],
        )}
      >
        <div className="flex items-center justify-between gap-4 border-b border-line-200 px-6 py-5">
          <div className="min-w-0">
            <h2 className="font-display text-[17px] font-bold text-navy-950">{title}</h2>
            {description && (
              <p className="mt-[3px] text-[12px] font-medium text-muted-500">{description}</p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="grid h-[30px] w-[30px] shrink-0 place-items-center rounded-[8px] bg-surface-field text-[14px] font-semibold text-muted-600 transition-colors hover:bg-line-250"
          >
            ✕
          </button>
        </div>

        <div className="scroll-thin flex-1 overflow-y-auto px-6 py-5">{children}</div>

        {footer && (
          <div className="flex items-center justify-end gap-[9px] border-t border-line-200 bg-surface-sunken px-6 py-4">
            {footer}
          </div>
        )}
      </div>
    </>,
    document.body,
  );
}

/**
 * The numbered step heading the design puts above each section of a drawer —
 * a navy disc with cyan digit, then the label in tracked caps.
 */
export function DrawerStep({
  n,
  children,
  className,
}: {
  n: number;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center gap-[9px]", className)}>
      <span className="grid h-[22px] w-[22px] shrink-0 place-items-center rounded-full bg-navy-950 text-[11px] font-bold text-brand-300">
        {n}
      </span>
      <span className="text-[12px] font-bold uppercase tracking-[.09em] text-navy-950">
        {children}
      </span>
    </div>
  );
}
