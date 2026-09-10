"use client";

import * as React from "react";

import { NewRecordDrawer } from "@/components/ui/new-record-drawer";
import { DrawerStep } from "@/components/ui/drawer";
import { GrnForm } from "./new/grn-form";
import { formatDate, money } from "@/lib/utils";
import type { GrnLookups } from "./lookups";

/**
 * Both steps of the design's receive flow in one drawer: choose the purchase
 * order that arrived, then record what actually came against it.
 */
export function NewGrnDrawer({ openPos, stores }: GrnLookups) {
  const [poId, setPoId] = React.useState<string | null>(null);
  const po = openPos.find((p) => p.id === poId) ?? null;

  return (
    <NewRecordDrawer
      label="Receive material"
      title="Receive material"
      description="Record what actually arrived — accepted, rejected and short — against the challan."
    >
      {openPos.length === 0 ? (
        <p className="px-2 py-12 text-center text-[12.5px] font-medium text-muted-500">
          No purchase orders are awaiting delivery. Material can only be received
          against an approved purchase order.
        </p>
      ) : !po ? (
        <>
          <DrawerStep n={1} className="mb-3">Which purchase order arrived?</DrawerStep>
          <ul className="divide-y divide-line-200 overflow-hidden rounded-[11px] border border-line-400">
            {openPos.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => setPoId(p.id)}
                  className="flex w-full items-center justify-between gap-3 px-3.5 py-3 text-left transition-colors hover:bg-surface-hover"
                >
                  <span className="min-w-0">
                    <span className="block text-[12.5px] font-bold text-navy-950">{p.poNo}</span>
                    <span className="block text-[11.5px] font-medium text-muted-500">
                      {p.projectCode} · {p.vendorName} · {p.lines.length} line
                      {p.lines.length === 1 ? "" : "s"}
                      {p.expectedDate && ` · expected ${formatDate(p.expectedDate)}`}
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
            <DrawerStep n={2}>Receipt against {po.poNo}</DrawerStep>
            <button
              type="button"
              onClick={() => setPoId(null)}
              className="ml-auto text-[11.5px] font-bold text-brand-700 transition-colors hover:text-navy-800"
            >
              ← Choose another
            </button>
          </div>
          <GrnForm
            po={{
              id: po.id,
              poNo: po.poNo,
              vendorName: po.vendorName,
              projectCode: po.projectCode,
              projectName: po.projectName,
            }}
            stores={stores.filter((s) => !s.projectId || s.projectId === po.projectId)}
            lines={po.lines}
          />
        </>
      )}
    </NewRecordDrawer>
  );
}
