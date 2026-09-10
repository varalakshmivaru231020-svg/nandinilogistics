"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

import { cn } from "@/lib/utils";

export function Modal({
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
  size?: "sm" | "md" | "lg" | "xl";
}) {
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  // Portalled to <body> so no ancestor can contain it. A page wrapper with a
  // transform (an animation, a sticky column) would otherwise become the
  // containing block and clip a fixed overlay to its own box.
  if (!open || typeof document === "undefined") return null;

  const sizes = { sm: "max-w-md", md: "max-w-2xl", lg: "max-w-4xl", xl: "max-w-6xl" };

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-navy-950/35 p-4 backdrop-blur-[2px] sm:p-8">
      <div
        className={cn("animate-fade-up w-full rounded-[14px] border border-line-400 bg-white shadow-[0_24px_60px_rgba(25,26,92,.18)]", sizes[size])}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="flex items-start justify-between gap-4 border-b border-line-200 px-[20px] py-4">
          <div className="min-w-0">
            <h2 className="font-display text-[15px] font-bold text-navy-950">{title}</h2>
            {description && <p className="mt-1 text-[11.5px] font-medium leading-relaxed text-muted-600">{description}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-[8px] p-1.5 text-muted-400 hover:bg-surface-hover hover:text-navy-900"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="scroll-thin max-h-[70vh] overflow-y-auto px-[20px] py-[18px]">{children}</div>
        {footer && (
          <div className="flex items-center justify-end gap-2 border-t border-line-200 bg-surface-sunken px-[20px] py-3.5">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

/** Destructive-action confirmation, used by every delete button. */
export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = "Delete",
  loading,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmLabel?: string;
  loading?: boolean;
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      size="sm"
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            className="h-9 rounded-[9px] border border-line-400 bg-white px-4 text-[12.5px] font-bold text-navy-600 hover:bg-surface-hover"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            className="h-9 rounded-[9px] bg-bad-600 px-4 text-[12.5px] font-bold text-white hover:brightness-95 disabled:opacity-50"
          >
            {loading ? "Working…" : confirmLabel}
          </button>
        </>
      }
    >
      <p className="text-[12.5px] font-medium leading-relaxed text-navy-600">{message}</p>
    </Modal>
  );
}
