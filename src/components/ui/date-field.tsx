"use client";

import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * A date field that picks a date.
 *
 * The design draws these as plain fields carrying an example — "01 Apr 2027" —
 * and a native date control cannot show a placeholder: it always renders
 * dd/mm/yyyy. So the control is a real `<input type="date">`, with its own
 * text painted transparent while it is empty and the design's example drawn
 * over it. The calendar opens, the keyboard works, the form posts an ISO date,
 * and at rest it reads the way the design reads.
 */
export const DateField = React.forwardRef<
  HTMLInputElement,
  Omit<React.InputHTMLAttributes<HTMLInputElement>, "type"> & {
    placeholder?: string;
    /** Layout for the field as a whole — margins belong here, not on the input. */
    wrapperClassName?: string;
  }
>(({ className, wrapperClassName, placeholder, defaultValue, value, onChange, ...props }, ref) => {
  // Uncontrolled fields have to be watched; a controlled one already says.
  const [typed, setTyped] = React.useState(!!defaultValue);
  const empty = value !== undefined ? !value : !typed;

  return (
    <span className={cn("relative block", wrapperClassName)}>
      <input
        ref={ref}
        type="date"
        defaultValue={defaultValue}
        value={value}
        data-empty={empty ? "" : undefined}
        onChange={(e) => {
          setTyped(!!e.target.value);
          onChange?.(e);
        }}
        className={cn(
          "date-field peer w-full rounded-[9px] border border-line-400 bg-surface-sunken px-3 py-2.5 text-[12.5px] font-medium text-navy-900",
          "focus:border-brand-500 focus:bg-white focus:outline-none disabled:opacity-60",
          className,
        )}
        {...props}
      />
      {empty && placeholder && (
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[12.5px] font-medium text-muted-400 peer-focus:hidden">
          {placeholder}
        </span>
      )}
    </span>
  );
});
DateField.displayName = "DateField";
