"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { holdUnitAction, createCostSheetAction } from "../../sales/cost-sheets/actions";
import { createBookingAction, createCustomerAction } from "../../sales/bookings/actions";

interface Customer { id: string; name: string; phone: string }

/**
 * The design's Hold / Book drawer, on the flats screen itself: pick a customer
 * or create one, add remarks, confirm. Booking prices the unit from the active
 * price list first, so a booking always has the cost sheet behind it.
 */
export function ReserveDrawer({
  mode, unitId, unitNumber, unitPlan, area, customers, heldForId, onClose,
}: {
  mode: "hold" | "book";
  /** The customer a held unit is already promised to, so booking it does not ask again. */
  heldForId?: string | null;
  unitId: string;
  unitNumber: string;
  unitPlan: string;
  area: number;
  customers: Customer[];
  onClose: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const [creating, setCreating] = React.useState(false);
  const [customerId, setCustomerId] = React.useState(heldForId ?? "");
  const [q, setQ] = React.useState("");

  // The list is searched by name or mobile, which is how a customer is asked
  // for at the counter.
  const found = React.useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return customers;
    const digits = needle.replace(/\D/g, "");
    return customers.filter(
      (c) =>
        c.name.toLowerCase().includes(needle) ||
        (digits.length > 0 && c.phone.replace(/\D/g, "").includes(digits)),
    );
  }, [customers, q]);
  const [remarks, setRemarks] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const formRef = React.useRef<HTMLFormElement>(null);

  async function confirm() {
    setBusy(true);
    setError(null);

    let chosen = customerId;
    if (creating && formRef.current) {
      const made = await createCustomerAction(new FormData(formRef.current));
      if (!made.ok) { setBusy(false); setError(made.error); return; }
      chosen = made.data.id;
    }

    if (mode === "hold") {
      // A hold is for somebody. Asking who and then dropping the answer is how
      // the board came to say "held by Priya" and never "held for the Kumars".
      if (!chosen) { setBusy(false); setError("Choose a customer, or create one."); return; }
      const held = await holdUnitAction(unitId, null, chosen, remarks);
      setBusy(false);
      if (!held.ok) { setError(held.error); return; }
      toast(`Unit ${unitNumber} held.`);
    } else {
      if (!chosen) { setBusy(false); setError("Choose a customer, or create one."); return; }
      const sheet = await createCostSheetAction(unitId, null, [], 0);
      if (!sheet.ok) { setBusy(false); setError(sheet.error); return; }
      const booked = await createBookingAction(sheet.data.id, chosen, null, remarks);
      setBusy(false);
      if (!booked.ok) { setError(booked.error); return; }
      toast(`Unit ${unitNumber} booked — token receipt and KYC next.`);
    }

    onClose();
    router.refresh();
  }

  return (
    <>
      <div onClick={onClose} className="fixed inset-0 z-[82] bg-[rgba(25,26,92,.38)]" />
      <div className="fixed inset-y-0 right-0 z-[83] flex w-[460px] max-w-[94vw] flex-col bg-white shadow-[-24px_0_60px_rgba(25,26,92,.2)]">
        <div className="flex items-center justify-between border-b border-line-200 px-6 py-5">
          <div>
            <p className="font-display text-[17px] font-bold text-navy-950">
              {mode === "hold" ? "Hold unit" : "Book unit"}
            </p>
            <p className="mt-[3px] text-[12px] font-medium text-muted-500">
              Unit {unitNumber} · {unitPlan} · {area} sq ft
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="grid h-[30px] w-[30px] place-items-center rounded-[8px] bg-surface-field text-[14px] font-semibold text-muted-600 hover:brightness-95"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          {error && (
            <p className="mb-3 rounded-[9px] border border-bad-100 bg-bad-050 px-3 py-2 text-[12px] font-semibold text-bad-700">
              {error}
            </p>
          )}

          <div className="mb-3.5 flex gap-[7px]">
            <Toggle picked={!creating} onClick={() => setCreating(false)}>Select customer</Toggle>
            <Toggle picked={creating} onClick={() => setCreating(true)}>+ Create customer</Toggle>
          </div>

          {!creating && (
            <div className="flex flex-col gap-[7px]">
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search by name or mobile number…"
                autoFocus
              />
              {found.length > 0 && (
                <p className="px-1 text-[11px] font-medium text-muted-400">
                  {found.length} of {customers.length} {customers.length === 1 ? "customer" : "customers"}
                </p>
              )}
              {/*
                Five customers, then scroll — searching or not. A row is 37px
                and the gaps are 7px, so five of them come to 213px exactly;
                the sixth is below the fold rather than half-shown.
              */}
              {found.length > 0 && (
                <div className="scroll-thin flex max-h-[213px] flex-col gap-[7px] overflow-y-auto">
                  {found.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setCustomerId(c.id)}
                      className={cn(
                        "flex shrink-0 items-center justify-between gap-2 rounded-[10px] border px-3 py-2.5 text-left text-[12.5px] font-semibold",
                        customerId === c.id
                          ? "border-brand-500 bg-brand-100 text-brand-700"
                          : "border-line-400 bg-white text-navy-900 hover:border-brand-500",
                      )}
                    >
                      {c.name}
                      <span className="num text-[11px] font-medium text-muted-500">{c.phone}</span>
                    </button>
                  ))}
                </div>
              )}
              {customers.length === 0 && (
                <p className="py-4 text-center text-[12px] font-medium text-muted-300">
                  No customers yet — create one
                </p>
              )}
              {customers.length > 0 && found.length === 0 && (
                <p className="py-4 text-center text-[12px] font-medium text-muted-300">
                  Nobody matches “{q.trim()}” — create them instead
                </p>
              )}
            </div>
          )}

          {creating && (
            <form ref={formRef} className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <p className="mb-[5px] text-[11px] font-semibold text-muted-600">Customer name</p>
                <Input name="name" placeholder="Full name" required />
              </div>
              <div>
                <p className="mb-[5px] text-[11px] font-semibold text-muted-600">Mobile</p>
                <Input name="phone" placeholder="+91" required />
              </div>
              <div>
                <p className="mb-[5px] text-[11px] font-semibold text-muted-600">Email</p>
                <Input name="email" type="email" placeholder="name@email.com" />
              </div>
            </form>
          )}

          <div className="mt-4">
            <p className="mb-[5px] text-[11px] font-semibold text-muted-600">Remarks</p>
            <Textarea
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              rows={3}
              placeholder="e.g. token advance promised by Friday, wants park-facing view…"
            />
          </div>

          <p className="mt-3 rounded-[11px] border border-amber-200 bg-warn-050 px-3.5 py-[11px] text-[11.5px] font-semibold text-warn-800">
            Held units stay reserved until released or booked manually. Bookings proceed to token
            receipt and KYC.
          </p>
        </div>

        <div className="flex justify-end gap-[9px] border-t border-line-200 bg-surface-sunken px-6 py-4">
          <Button variant="outline" type="button" onClick={onClose}>Cancel</Button>
          <Button onClick={confirm} loading={busy} className="bg-good-600 hover:bg-good-700">
            {mode === "hold" ? "Reserve on hold" : "Confirm booking"}
          </Button>
        </div>
      </div>
    </>
  );
}

function Toggle({ children, picked, onClick }: { children: React.ReactNode; picked: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-[9px] border px-3.5 py-2 text-[12px] font-semibold",
        picked
          ? "border-brand-500 bg-brand-100 text-brand-700"
          : "border-line-400 bg-white text-navy-600 hover:border-brand-500",
      )}
    >
      {children}
    </button>
  );
}
