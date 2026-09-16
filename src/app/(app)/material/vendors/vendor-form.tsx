"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { Alert } from "@/components/ui/primitives";
import { DetailAction, DetailScreen } from "@/components/shell/detail-screen";
import { cn } from "@/lib/utils";
import { addItemCategoryAction, createVendorAction, updateVendorAction } from "./actions";

export interface VendorFormValues {
  id: string; code: string; name: string; contactPerson: string; phone: string;
  email: string; gstin: string; pan: string; paymentTerms: string;
  accountNumber: string; ifsc: string; bankName: string; upiId: string;
  addressLine: string; categoryIds: string[];
}

const LABEL = "text-[11px] font-semibold text-navy-600";
const REQUIRED = <span className="text-bad-600">*</span>;
const FIELD =
  "mt-1.5 w-full rounded-[9px] border border-line-400 bg-surface-sunken px-3 py-2.5 text-[12.5px] font-medium text-navy-900 outline-none transition-colors focus:border-brand-500 focus:bg-white";

/**
 * The design's vendor form: the categories they supply as chips, then the
 * contact, tax, banking and address details. Only the name and the mobile
 * number are mandatory; the code is generated.
 */
export function VendorForm({
  categories: initialCategories, vendor,
}: {
  categories: Array<{ id: string; name: string }>;
  /** An existing vendor being corrected, or nothing for a new one. */
  vendor?: VendorFormValues;
}) {
  const router = useRouter();
  const [categories, setCategories] = React.useState(initialCategories);
  const [picked, setPicked] = React.useState<string[]>(vendor?.categoryIds ?? []);
  const [newCategory, setNewCategory] = React.useState("");
  const [values, setValues] = React.useState({
    name: vendor?.name ?? "",
    contactPerson: vendor?.contactPerson ?? "",
    phone: vendor?.phone ?? "",
    email: vendor?.email ?? "",
    gstin: vendor?.gstin ?? "",
    pan: vendor?.pan ?? "",
    paymentTerms: vendor?.paymentTerms ?? "",
    accountNumber: vendor?.accountNumber ?? "",
    ifsc: vendor?.ifsc ?? "",
    bankName: vendor?.bankName ?? "",
    upiId: vendor?.upiId ?? "",
    addressLine: vendor?.addressLine ?? "",
  });
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  function set(key: keyof typeof values, value: string) {
    setValues((v) => ({ ...v, [key]: value }));
  }

  async function addCategory() {
    const name = newCategory.trim();
    if (!name) return;
    const res = await addItemCategoryAction(name);
    if (!res.ok) { setError(res.error); return; }
    setCategories((cs) => (cs.some((c) => c.id === res.data.id) ? cs : [...cs, res.data]));
    setPicked((p) => (p.includes(res.data.id) ? p : [...p, res.data.id]));
    setNewCategory("");
  }

  async function save() {
    setBusy(true);
    setError(null);
    const payload = { ...values, categoryIds: picked };
    if (vendor) {
      const res = await updateVendorAction(vendor.id, payload);
      setBusy(false);
      if (!res.ok) { setError(res.error); return; }
      router.push(`/material/vendors/${vendor.id}`);
      router.refresh();
      return;
    }
    const res = await createVendorAction(payload);
    setBusy(false);
    if (!res.ok) { setError(res.error); return; }
    router.push(`/material/vendors/${res.data.id}`);
    router.refresh();
  }

  const ready = values.name.trim().length > 1 && values.phone.trim().length > 5;

  const text = (key: keyof typeof values, label: string, placeholder: string, required = false) => (
    <label className="block">
      <span className={LABEL}>{label} {required && REQUIRED}</span>
      <input
        value={values[key]}
        onChange={(e) => set(key, e.target.value)}
        placeholder={placeholder}
        className={FIELD}
      />
    </label>
  );

  return (
    <DetailScreen
      backHref="/material/vendors"
      title={vendor ? "Edit vendor" : "New vendor"}
      pills={
        vendor ? (
          <span className="rounded-full bg-surface-field px-[10px] py-[5px] text-[10.5px] font-bold text-navy-500">
            {vendor.code}
          </span>
        ) : null
      }
      subtitle="Vendor code is generated automatically. Only vendor name and mobile number are mandatory."
      actions={
        <DetailAction tone="primary" disabled={!ready || busy} onClick={save}>
            {vendor ? "Save vendor" : "Create vendor"}
          </DetailAction>
      }
    >
      {error && <div className="mb-3.5"><Alert tone="error">{error}</Alert></div>}

      <div className="mx-auto max-w-[860px] rounded-[13px] border border-line-400 bg-white px-5 py-[18px]">
        <div className="mb-3 text-[11px] font-bold uppercase tracking-[.12em] text-muted-400">
          Vendor details
        </div>

        <div className="rounded-[11px] border border-line-300 bg-surface-tint px-3.5 py-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className={LABEL}>Supply categories</span>
            <span className="rounded-full bg-brand-100 px-2 py-[3px] text-[9.5px] font-bold text-brand-700">
              {picked.length ? `${picked.length} selected` : "None selected"}
            </span>
          </div>
          <div className="mt-2.5 flex flex-wrap gap-2">
            {categories.map((c) => {
              const on = picked.includes(c.id);
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setPicked((p) => (on ? p.filter((x) => x !== c.id) : [...p, c.id]))}
                  className={cn(
                    "cursor-pointer rounded-full border px-3 py-1.5 text-[11.5px] font-semibold transition-colors",
                    on
                      ? "border-brand-500 bg-brand-100 text-brand-700"
                      : "border-line-400 bg-white text-navy-500 hover:border-brand-500",
                  )}
                >
                  {on ? "✓" : "+"} {c.name}
                </button>
              );
            })}
          </div>
          <div className="mt-2.5 flex flex-wrap gap-2">
            <input
              value={newCategory}
              onChange={(e) => setNewCategory(e.target.value)}
              placeholder="Add a new category — e.g. Waterproofing"
              className="min-w-[220px] flex-1 rounded-[9px] border border-line-400 bg-white px-3 py-2.5 text-[12.5px] font-medium text-navy-900 outline-none focus:border-brand-500"
            />
            <button
              type="button"
              onClick={addCategory}
              className="shrink-0 cursor-pointer rounded-[9px] border border-line-400 bg-white px-3.5 py-2.5 text-[12px] font-bold text-brand-700 transition-colors hover:border-brand-500"
            >
              + Add category
            </button>
          </div>
        </div>

        <div className="mt-3.5 grid gap-3.5 sm:grid-cols-2">
          <div className="sm:col-span-2">{text("name", "Vendor name", "Sri Balaji Agencies", true)}</div>
          {text("contactPerson", "Contact person", "B. Ramesh")}
          {text("phone", "Mobile number", "98450 00000", true)}
          {text("email", "Email", "sales@vendor.in")}
          {text("gstin", "GSTIN", "29ABCDE1234F1Z5")}
          {text("pan", "PAN", "ABCDE1234F")}
          {text("paymentTerms", "Payment terms", "30 days credit")}
          {text("accountNumber", "Bank account number", "50100234567890")}
          {text("ifsc", "IFSC code", "HDFC0001234")}
          {text("bankName", "Bank & branch", "HDFC Bank · Mysore Road")}
          {text("upiId", "UPI ID", "sribalaji@okhdfcbank")}
          <label className="block sm:col-span-2">
            <span className={LABEL}>Address</span>
            <textarea
              rows={3}
              value={values.addressLine}
              onChange={(e) => set("addressLine", e.target.value)}
              placeholder="Yard address, city"
              className={cn(FIELD, "resize-y")}
            />
          </label>
        </div>
      </div>
    </DetailScreen>
  );
}
