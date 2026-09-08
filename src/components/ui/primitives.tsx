import * as React from "react";

import { cn } from "@/lib/utils";

/* --------------------------------- Card ---------------------------------- */

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("rounded-[13px] border border-line-400 bg-white", className)}
      {...props}
    />
  );
}

export function CardHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-between gap-2.5 border-b border-line-200 px-[18px] py-[15px]",
        className,
      )}
      {...props}
    />
  );
}

export function CardTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h3
      className={cn("font-display text-[14px] font-bold text-navy-950", className)}
      {...props}
    />
  );
}

/** The quieter line the design pairs under most card titles. */
export function CardSubtitle({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p className={cn("mt-0.5 text-[11.5px] font-medium text-muted-600", className)} {...props} />
  );
}

export function CardBody({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("px-[18px] py-[15px]", className)} {...props} />;
}

/** A card nested inside another, with the design's sunken header. */
export function Panel({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("overflow-hidden rounded-[12px] border border-line-300", className)} {...props} />
  );
}

export function PanelHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "flex items-center justify-between border-b border-line-200 bg-surface-sunken px-[13px] py-[11px]",
        className,
      )}
      {...props}
    />
  );
}

/* --------------------------------- Badge --------------------------------- */

const BADGE_TONES = {
  slate: "bg-surface-field text-navy-600 ring-line-400",
  brand: "bg-brand-100 text-brand-700 ring-brand-100",
  navy: "bg-navy-950 text-brand-300 ring-navy-950",
  good: "bg-good-050 text-good-700 ring-good-050",
  warn: "bg-warn-050 text-warn-700 ring-warn-050",
  bad: "bg-bad-050 text-bad-600 ring-bad-050",
  muted: "bg-surface-tint text-muted-600 ring-line-300",
} as const;

export type BadgeTone = keyof typeof BADGE_TONES;

export function Badge({
  tone = "slate",
  className,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & { tone?: BadgeTone }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-[11px] py-[4px] text-[11px] font-bold ring-1 ring-inset",
        BADGE_TONES[tone],
        className,
      )}
      {...props}
    />
  );
}

/* --------------------------------- Inputs -------------------------------- */

const FIELD_BASE =
  "w-full rounded-[9px] border border-line-400 bg-surface-field px-[13px] text-[12.5px] font-medium text-navy-900 " +
  "placeholder:text-muted-400 focus:border-brand-500 focus:bg-white focus:outline-none focus:ring-1 focus:ring-brand-500/30 " +
  "disabled:opacity-60";

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input ref={ref} className={cn(FIELD_BASE, "h-[38px]", className)} {...props} />
  ),
);
Input.displayName = "Input";

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea ref={ref} className={cn(FIELD_BASE, "py-2.5", className)} {...props} />
));
Textarea.displayName = "Textarea";

export const Select = React.forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement>
>(({ className, ...props }, ref) => (
  <select ref={ref} className={cn(FIELD_BASE, "h-[38px] pr-8", className)} {...props} />
));
Select.displayName = "Select";

export function Label({
  className,
  required,
  children,
  ...props
}: React.LabelHTMLAttributes<HTMLLabelElement> & { required?: boolean }) {
  return (
    <label
      className={cn(
        "block text-[10.5px] font-bold uppercase tracking-[.08em] text-muted-500",
        className,
      )}
      {...props}
    >
      {children}
      {required && <span className="ml-0.5 text-bad-600">*</span>}
    </label>
  );
}

export function Field({
  label,
  required,
  error,
  hint,
  children,
  className,
}: {
  label?: string;
  required?: boolean;
  error?: string;
  hint?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      {label && <Label required={required}>{label}</Label>}
      {children}
      {hint && !error && <p className="text-[11px] font-medium text-muted-400">{hint}</p>}
      {error && <p className="text-[11px] font-semibold text-bad-600">{error}</p>}
    </div>
  );
}

/* -------------------------------- Feedback ------------------------------- */

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-14 text-center">
      {icon && <div className="mb-1 text-line-500">{icon}</div>}
      <p className="font-display text-[14px] font-bold text-navy-950">{title}</p>
      {description && (
        <p className="max-w-sm text-[11.5px] font-medium leading-relaxed text-muted-600">
          {description}
        </p>
      )}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}

const ALERT_TONES = {
  info: "border-brand-100 bg-brand-100/50 text-navy-900",
  warn: "border-warn-050 bg-warn-050 text-warn-700",
  error: "border-bad-050 bg-bad-050 text-bad-600",
  success: "border-good-050 bg-good-050 text-good-700",
} as const;

export function Alert({
  tone = "info",
  title,
  children,
}: {
  tone?: keyof typeof ALERT_TONES;
  title?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className={cn("rounded-[12px] border px-[14px] py-[11px]", ALERT_TONES[tone])}>
      {title && <p className="text-[12.5px] font-bold">{title}</p>}
      {children && (
        <div className={cn(title && "mt-1", "text-[11.5px] font-medium leading-relaxed opacity-95")}>
          {children}
        </div>
      )}
    </div>
  );
}

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
  return (
    <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        {breadcrumb && (
          <div className="mb-1.5 text-[11px] font-semibold text-muted-500">{breadcrumb}</div>
        )}
        <h1 className="font-display text-[19px] font-extrabold tracking-[-.02em] text-navy-950">
          {title}
        </h1>
        {description && (
          <p className="mt-1 max-w-3xl text-[12px] font-medium leading-relaxed text-muted-600">
            {description}
          </p>
        )}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

/** The uppercase micro-label the design uses above figures. */
export function StatLabel({ className, ...props }: React.HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn(
        "text-[11px] font-semibold uppercase tracking-[.08em] text-muted-600",
        className,
      )}
      {...props}
    />
  );
}

export function StatValue({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p
      className={cn(
        "num font-display text-[26px] font-extrabold tracking-[-.02em] text-navy-950",
        className,
      )}
      {...props}
    />
  );
}
