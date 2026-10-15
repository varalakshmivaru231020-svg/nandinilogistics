import "server-only";

import type { ScreenRow } from "@/lib/screens/rows";
import { moneyShort, phone as phoneText } from "@/lib/utils";

/**
 * The vendor row, as the directory card in
 * `src/app/(app)/material/vendors/page.tsx` draws one: the name with its code
 * and whether it is active or on hold, the contact line, the e-mail, what it
 * supplies, GSTIN and PAN, the payment term and how many POs it has had — and
 * the rating with on-time delivery, for whoever may see vendor performance.
 *
 * The card calls an inactive vendor **"On hold"**, which is one of the words
 * the app used to guess wrong.
 */

export interface VendorRowInput {
  id: string;
  code: string;
  name: string;
  status: string;
  contactPerson: string | null;
  phone: string | null;
  email: string | null;
  gstin: string | null;
  pan: string | null;
  categories: string[];
  paymentTerm: string | null;
  poCount: number;
  rating: number | null;
  onTimePct: number | null;
  spend: number;
}

export function vendorScreenRow(v: VendorRowInput, showPerformance: boolean): ScreenRow {
  const contact =
    [v.contactPerson, v.phone && phoneText(v.phone)].filter(Boolean).join(" · ") ||
    "No contact recorded";

  return {
    id: v.id,
    title: v.name,
    chips: [
      { text: v.code, tone: "draft" },
      v.status === "ACTIVE"
        ? { text: "Active", tone: "good" as const }
        : { text: "On hold", tone: "warn" as const },
    ],
    meta: contact,
    lines: [
      ...(v.email ? [{ value: v.email }] : []),
      ...(v.categories.length > 0 ? [{ value: v.categories.join(" · ") }] : []),
      { label: "GSTIN · PAN", value: `${v.gstin ?? "—"} · ${v.pan ?? "—"}` },
      {
        label: "Terms · POs",
        value:
          `${v.paymentTerm ?? "—"} · ${v.poCount} PO${v.poCount === 1 ? "" : "s"}` +
          (showPerformance ? ` · ${moneyShort(v.spend)} spend` : ""),
      },
    ],
    ...(showPerformance
      ? {
          trailing: {
            value: `★ ${v.rating === null ? "—" : Number(v.rating).toFixed(1)}`,
            label: v.onTimePct === null ? "no deliveries yet" : `${v.onTimePct}% on-time`,
          },
        }
      : {}),
  };
}

export function vendorEmpty(filtered: boolean) {
  return { title: filtered ? "No vendors match these filters" : "No vendors yet" };
}

export const VENDOR_NOTE =
  "A PO can only be raised against an active vendor. Vendors on hold stay visible for history " +
  "but cannot receive new orders.";
