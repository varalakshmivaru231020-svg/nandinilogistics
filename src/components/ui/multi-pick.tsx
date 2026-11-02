"use client";

import * as React from "react";

import { SearchSelect, type SearchOption } from "@/components/ui/search-select";

/**
 * Pick several from a list: a type-to-search dropdown that adds a chip for
 * each pick, and a chip you tap to remove.
 *
 * A native `<select multiple>` is an open box that needs Ctrl held to pick
 * a second item, which nobody knows; this is the control the rider form
 * uses for its companies, shared so every form picks companies the same way.
 * Each pick is posted as its own `name` value, which `readIdList` and
 * `formData.getAll` both read.
 */
export function MultiPick({
  name, options, value, onChange, placeholder = "Search and pick…", addMorePlaceholder = "Add another…",
  emptyLabel = "Nothing matches", disabled = false, required = false,
}: {
  name: string;
  options: SearchOption[];
  value: string[];
  onChange: (ids: string[]) => void;
  placeholder?: string;
  addMorePlaceholder?: string;
  emptyLabel?: string;
  disabled?: boolean;
  /** At least one pick, enforced by a hidden required input the browser checks. */
  required?: boolean;
}) {
  const remaining = options.filter((o) => !value.includes(o.id));
  return (
    <div>
      {value.map((id) => <input key={id} type="hidden" name={name} value={id} />)}
      {required && value.length === 0 && (
        // An empty required field, so the browser stops the form here.
        <input tabIndex={-1} aria-hidden className="pointer-events-none absolute h-0 w-0 opacity-0" required value="" onChange={() => {}} />
      )}
      {disabled ? (
        <p className="rounded-[9px] border border-line-400 bg-surface-sunken px-3 py-2 text-[12.5px] font-medium text-muted-400">
          {value.length ? "" : "—"}
        </p>
      ) : (
        <SearchSelect
          value=""
          placeholder={value.length ? addMorePlaceholder : placeholder}
          emptyLabel={emptyLabel}
          options={remaining}
          onChange={(id) => { if (id && !value.includes(id)) onChange([...value, id]); }}
        />
      )}
      {value.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {value.map((id) => {
            const o = options.find((c) => c.id === id);
            return (
              <button
                key={id}
                type="button"
                disabled={disabled}
                onClick={() => onChange(value.filter((v) => v !== id))}
                className="rounded-full bg-brand-100 px-2.5 py-1 text-[11px] font-semibold text-brand-700 disabled:opacity-60"
                title="Remove"
              >
                {o?.label ?? id} ×
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
