"use client";

import * as React from "react";

import { NewRecordDrawer } from "@/components/ui/new-record-drawer";
import { DrawerStep } from "@/components/ui/drawer";
import { InvoiceForm } from "./new/invoice-form";
import { money } from "@/lib/utils";
import type { InvoiceLookups } from "./lookups";

export function NewInvoiceDrawer({ invoiceable }: InvoiceLookups) {
  const [poId, setPoId] = React.useState<string | null>(null);
  const po = invoiceable.find((p) => p.id === poId) ?? null;

  return (
    <NewRecordDrawer
      label="Record invoice"
      title="Record vendor invoice"
      description="Matched against the purchase order and what was actually received."
    >
      {invoiceable.length === 0 ? (
        <p className="px-2 py-12 text-center text-[12.5px] font-medium text-muted-500">
          Nothing to invoice yet. A purchase order can only be billed once material
          has been received against it.
        </p>
      ) : !po ? (
        <>
          <DrawerStep n={1} className="mb-3">Which purchase order is being billed?</DrawerStep>
          <ul className="divide-y divide-line-200 overflow-hidden rounded-[11px] border border-line-400">
            {invoiceable.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => setPoId(p.id)}
                  className="flex w-full items-center justify-between gap-3 px-3.5 py-3 text-left transition-colors hover:bg-surface-hover"
                >
                  <span className="min-w-0">
                    <span className="block text-[12.5px] font-bold text-navy-950">{p.poNo}</span>
                    <span className="block text-[11.5px] font-medium text-muted-500">
                      {p.projectCode} · {p.vendorName}
                      {p.invoiceCount > 0 && ` · ${p.invoiceCount} invoice(s) already`}
                    </span>
                  </span>
                  <span className="num shrink-0 text-[12px] font-semibold text-muted-600">
                    {money(p.totalAmount)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <DrawerStep n={2}>Invoice against {po.poNo}</DrawerStep>
            <button
              type="button"
              onClick={() => setPoId(null)}
              className="ml-auto text-[11.5px] font-bold text-brand-700 transition-colors hover:text-navy-800"
            >
              ← Choose another
            </button>
          </div>
          <InvoiceForm
            po={{
              id: po.id,
              poNo: po.poNo,
              vendorName: po.vendorName,
              vendorGstin: po.vendorGstin,
              projectCode: po.projectCode,
            }}
            lines={po.lines}
          />
        </>
      )}
    </NewRecordDrawer>
  );
}
