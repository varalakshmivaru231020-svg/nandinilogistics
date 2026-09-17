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
  slate: "bg-surface-field text-navy-600",
  brand: "bg-brand-100 text-brand-700",
  navy: "bg-navy-950 text-brand-300",
  good: "bg-good-050 text-good-700",
  warn: "bg-warn-050 text-warn-700",
  bad: "bg-bad-050 text-bad-700",
  muted: "bg-surface-tint text-muted-600",
  /** The design's "Planned" violet. */
  violet: "bg-plum-050 text-plum-600",
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
        "inline-flex items-center whitespace-nowrap rounded-full px-[10px] py-[5px] text-[10.5px] font-bold",
        BADGE_TONES[tone],
        className,
      )}
      {...props}
    />
  );
}

/* --------------------------------- Inputs -------------------------------- */

/**
 * Taken from the design's own input rule:
 *   border:1px solid #E3E7F2; border-radius:9px; padding:10px 12px;
 *   font:500 12.5px 'Public Sans'; color:#22264A; background:#FAFBFE;
 *   focus -> border-color:#0089C9; background:#fff
 * No focus ring — the design changes the border and the fill, nothing else.
 */
const FIELD_BASE =
  "w-full rounded-[9px] border border-line-400 bg-surface-sunken px-3 text-[12.5px] font-medium text-navy-900 " +
  "placeholder:text-muted-400 focus:border-brand-500 focus:bg-white focus:outline-none " +
  "disabled:opacity-60";

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input ref={ref} className={cn(FIELD_BASE, "py-2.5", className)} {...props} />
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
  <select ref={ref} className={cn(FIELD_BASE, "py-2.5 pr-8", className)} {...props} />
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
        // The design's field label: 600 11px, muted, sentence case — not the
        // uppercase tracked caps this used to render.
        "block text-[11px] font-semibold text-muted-600",
        className,
      )}
      {...props}
    >
      {children}
      {required && <span className="text-bad-600">*</span>}
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
    <div className={cn("space-y-[5px]", className)}>
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

export { PageHeader } from "@/components/ui/page-header";

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
