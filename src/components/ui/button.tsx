"use client";

import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Button styles taken from the admin design.
 *
 * The design uses cyan for the primary call to action, green only for
 * approvals, and an outlined white button carrying brand-coloured text for
 * secondary actions.
 */
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-1.5 whitespace-nowrap font-sans font-bold transition-colors " +
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 focus-visible:ring-offset-1 " +
    "disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        primary: "bg-brand-500 text-white hover:bg-brand-600",
        secondary: "border border-line-400 bg-white text-brand-700 hover:bg-surface-hover hover:border-brand-300",
        ghost: "border border-line-400 bg-white text-muted-600 hover:bg-surface-hover hover:text-navy-900",
        // The quiet button beside a panel's call to action — the design's
        // drawer footer Cancel: 600 12.5px in #5A6080 on white.
        outline: "border border-line-400 bg-white font-semibold text-navy-500 hover:bg-surface-field",
        plain: "bg-transparent text-muted-600 hover:bg-surface-hover hover:text-navy-950",
        success: "bg-good-600 text-white hover:bg-good-700",
        danger: "bg-bad-600 text-white hover:brightness-95",
        warning: "bg-warn-700 text-white hover:brightness-95",
        dark: "bg-navy-950 text-brand-300 hover:bg-navy-700",
        link: "text-brand-500 hover:text-navy-800 underline-offset-4 hover:underline",
      },
      /*
       * The design sizes a button by its padding and its type, never by a fixed
       * height — 10px/16px at 12.5px comes out 34px tall, and that is the
       * number every screen is laid out against.
       */
      size: {
        xs: "rounded-[7px] px-[11px] py-1.5 text-[10.5px]",
        sm: "rounded-[9px] px-[15px] py-[9px] text-[12px]",
        md: "rounded-[9px] px-4 py-2.5 text-[12.5px]",
        lg: "rounded-[9px] px-[17px] py-[11px] text-[12.5px]",
        icon: "h-9 w-9 rounded-[9px]",
      },
    },
    /*
     * A bordered button carries its own 1px on each edge, so the design gives
     * it a pixel less padding and a smaller type size to land on the same
     * height as the filled one: 9px/14px at 12px reads 34px tall, exactly like
     * 10px/16px at 12.5px does without a border.
     */
    compoundVariants: [
      {
        size: "md",
        variant: ["secondary", "ghost"],
        className: "px-[14px] py-[9px] text-[12px]",
      },
      {
        size: "lg",
        variant: ["secondary", "ghost"],
        className: "px-4 py-2.5 text-[12.5px]",
      },
    ],
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  loading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, loading, children, disabled, ...props }, ref) => (
    <button
      ref={ref}
      className={cn(buttonVariants({ variant, size }), className)}
      disabled={disabled || loading}
      {...props}
    >
      {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
      {children}
    </button>
  ),
);
Button.displayName = "Button";

export { buttonVariants };
