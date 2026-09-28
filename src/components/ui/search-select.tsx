"use client";

import * as React from "react";

import { cn } from "@/lib/utils";

export interface SearchOption {
  id: string;
  /** What is shown once picked, and the first line of each row. */
  label: string;
  /** The second line — a code, a number, whatever tells two apart. */
  hint?: string;
  /** Everything typing should match against, beyond the label and hint. */
  keywords?: string;
}

/**
 * A select you can type into.
 *
 * A native <select> is fine for five payment terms and useless for four hundred
 * vendors, where the one you want is found by code or by the number you ring
 * rather than by scrolling. Digits are matched with the punctuation stripped,
 * so a phone number can be typed however it is written down.
 */
export function SearchSelect({
  options, value, onChange, placeholder = "Search…", emptyLabel = "Nothing matches", className, id, required,
}: {
  options: SearchOption[];
  value: string;
  onChange: (id: string) => void;
  placeholder?: string;
  emptyLabel?: string;
  className?: string;
  id?: string;
  required?: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  const [q, setQ] = React.useState("");
  const box = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const away = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", away);
    return () => document.removeEventListener("mousedown", away);
  }, []);

  const picked = options.find((o) => o.id === value) ?? null;

  const found = React.useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return options;
    const digits = needle.replace(/\D/g, "");
    return options.filter((o) => {
      const hay = `${o.label} ${o.hint ?? ""} ${o.keywords ?? ""}`.toLowerCase();
      if (hay.includes(needle)) return true;
      return digits.length >= 3 && hay.replace(/\D/g, "").includes(digits);
    });
  }, [options, q]);

  return (
    <div ref={box} className={cn("relative", className)}>
      <button
        type="button"
        id={id}
        onClick={() => { setOpen((o) => !o); setQ(""); }}
        className={cn(
          "flex w-full cursor-pointer items-center justify-between gap-2 rounded-[9px] border border-line-400",
          "bg-surface-sunken px-3 py-2.5 text-left text-[12.5px] font-medium",
          picked ? "text-navy-900" : "text-muted-400",
        )}
      >
        <span className="min-w-0 truncate">{picked ? picked.label : placeholder}</span>
        <span className="shrink-0 text-[10px] text-muted-500">▾</span>
      </button>

      {/* Kept for form posts and for required-field validation. */}
      <input type="hidden" value={value} required={required} />

      {open && (
        <div className="absolute left-0 right-0 top-[42px] z-50 rounded-[11px] border border-line-400 bg-white p-[7px] shadow-[0_16px_40px_rgba(25,26,92,.14)]">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={placeholder}
            autoFocus
            className="mb-[5px] w-full rounded-[8px] border border-line-400 bg-surface-sunken px-2.5 py-2 text-[12px] font-medium text-navy-900 outline-none focus:border-brand-500 focus:bg-white"
          />
          <div className="scroll-thin max-h-[230px] overflow-y-auto">
            {found.map((o) => (
              <button
                key={o.id}
                type="button"
                onClick={() => { onChange(o.id); setOpen(false); }}
                className={cn(
                  "block w-full cursor-pointer rounded-[8px] px-2.5 py-2 text-left transition-colors hover:bg-surface-hover",
                  o.id === value && "bg-brand-100",
                )}
              >
                <span className="block truncate text-[12.5px] font-semibold text-navy-900">{o.label}</span>
                {o.hint && (
                  <span className="num block truncate text-[11px] font-medium text-muted-400">{o.hint}</span>
                )}
              </button>
            ))}
            {found.length === 0 && (
              <p className="px-2.5 py-4 text-center text-[12px] font-medium text-muted-400">{emptyLabel}</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
