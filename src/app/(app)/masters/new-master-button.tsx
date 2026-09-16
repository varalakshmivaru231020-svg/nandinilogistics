"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { useToast } from "@/components/ui/toast";
import { MasterForm } from "./[key]/master-screen";
import type { MasterDef } from "@/lib/masters/types";

/**
 * The design puts "+ New item" and "+ New vendor" on the procurement screens
 * themselves, so the master's own form opens there rather than sending anyone
 * to another screen.
 */
export function NewMasterButton({
  def, options, label, record, className,
}: {
  def: MasterDef;
  options: Record<string, Array<{ value: string; label: string }>>;
  label: string;
  /** Pass a record to open it instead of a blank form. */
  record?: Record<string, unknown> | null;
  className?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const router = useRouter();
  const toast = useToast();

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={
          className ??
          "rounded-[9px] bg-brand-500 px-[15px] py-[9px] text-[12px] font-bold text-white transition-colors hover:bg-brand-600"
        }
      >
        {label}
      </button>
      {open && (
        <MasterForm
          def={def}
          options={options}
          record={record ?? null}
          onClose={() => setOpen(false)}
          onSaved={(message) => { setOpen(false); toast(message); router.refresh(); }}
        />
      )}
    </>
  );
}
