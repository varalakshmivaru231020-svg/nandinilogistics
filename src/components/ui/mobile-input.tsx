"use client";

import * as React from "react";

import { Input } from "@/components/ui/primitives";
import { mobileDigits } from "@/lib/forms/phone";

/**
 * A mobile number box: digits only, ten of them, the phone's numeric keypad.
 *
 * Anything but a digit is dropped as it is typed, the eleventh digit is
 * refused, and the browser's own validation names the rule before the form
 * is sent. The server checks the same rule again (src/lib/forms/phone.ts),
 * so this is a courtesy, not the guard.
 *
 * A stored value that still carries "+91" is shown as its ten digits; the
 * dial code select beside the box, where there is one, puts it back.
 */
export const MobileInput = React.forwardRef<
  HTMLInputElement,
  Omit<React.InputHTMLAttributes<HTMLInputElement>, "type" | "inputMode" | "maxLength" | "pattern">
>(({ defaultValue, value, onChange, placeholder, ...props }, ref) => {
  const shown = (v: unknown) => (v === undefined || v === null ? v : mobileDigits(String(v)));
  return (
    <Input
      ref={ref}
      type="tel"
      inputMode="numeric"
      autoComplete="tel-national"
      maxLength={10}
      pattern="[6-9][0-9]{9}"
      title="A 10-digit mobile number"
      placeholder={placeholder ?? "98765 43210"}
      defaultValue={shown(defaultValue) as string | undefined}
      value={shown(value) as string | undefined}
      onChange={onChange}
      onInput={(e) => {
        const el = e.currentTarget;
        const digits = el.value.replace(/\D/g, "").slice(0, 10);
        if (digits !== el.value) el.value = digits;
      }}
      {...props}
    />
  );
});
MobileInput.displayName = "MobileInput";
