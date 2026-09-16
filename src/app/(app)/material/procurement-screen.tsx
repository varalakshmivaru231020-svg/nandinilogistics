"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge, Card, EmptyState, Input, Select } from "@/components/ui/primitives";
import { cn, formatDate, money, qty } from "@/lib/utils";

export type ProcTab = "indents" | "pos" | "grns" | "vendors" | "items";

interface IndentRow {
  id: string; title: string; ref: string; project: string; by: string;
  raisedAt: string; requiredBy: string; activity: string | null;
  status: string; lineCount: number; value: number; fromStock: number; toBuy: number;
}
interface PoRow {
  id: string; no: string; project: string; vendor: string; poDate: string;
  expectedDate: string | null; status: string; total: number;
  ordered: number; received: number; indentNo: string | null;
  grnCount: number; invoiceCount: number;
}
interface GrnRow {
  id: string; no: string; poId: string; poNo: string; vendor: string; store: string;
  grnDate: string; challanNo: string | null; status: string;
  received: number; accepted: number; rejected: number;
}
interface VendorRow {
  id: string; code: string; name: string; contact: string | null; phone: string | null;
  gstin: string | null; city: string | null; term: string | null; rating: number | null;
  status: string; poCount: number; invoiceCount: number;
}
interface ItemRow {
  id: string; code: string; name: string; category: string; uom: string;
  reorderLevel: number; standardRate: number; onHand: number; status: string;
}

/** The chain the design draws on every indent row. */
const CHAIN_STEPS = [
  { key: "RAISED", short: "R", name: "Raised on site" },
  { key: "PM", short: "PM", name: "Project Manager approval" },
  { key: "ADMIN", short: "AD", name: "Owner / Admin approval" },
  { key: "STORE", short: "ST", name: "Store stock check" },
  { key: "PO", short: "PO", name: "Purchase order raised" },
];

function chainStage(status: string): number {
  switch (status) {
    case "DRAFT": return 0;
    case "SUBMITTED": return 1;
    case "PM_APPROVED": return 2;
    case "ADMIN_APPROVED": return 3;
    case "PARTIALLY_ORDERED": case "ORDERED": case "CLOSED": return 5;
    default: return -1;
  }
}

const STATUS_TONE: Record<string, "slate" | "warn" | "brand" | "good" | "bad" | "navy" | "muted"> = {
  DRAFT: "muted", SUBMITTED: "warn", PM_APPROVED: "brand", ADMIN_APPROVED: "good",
  PARTIALLY_ORDERED: "navy", ORDERED: "navy", CLOSED: "muted", REJECTED: "bad", CANCELLED: "muted",
  PENDING_APPROVAL: "warn", APPROVED: "good", PARTIALLY_RECEIVED: "brand", RECEIVED: "navy",
  INSPECTED: "warn", POSTED: "good", ACTIVE: "good", INACTIVE: "muted",
};

const FILTERS: Record<ProcTab, { placeholder: string; label: string; options: string[]; explain: string }> = {
  indents: {
    placeholder: "Search indent number or purpose…",
    label: "Status",
    options: ["DRAFT", "SUBMITTED", "PM_APPROVED", "ADMIN_APPROVED", "ORDERED", "CLOSED", "REJECTED", "CANCELLED"],
    explain:
      "An indent is an internal request to the store, not a purchase. The store checks live stock first: what is available is issued, and only the shortfall becomes a purchase order.",
  },
  pos: {
    placeholder: "Search purchase order number…",
    label: "Status",
    options: ["DRAFT", "PENDING_APPROVAL", "APPROVED", "PARTIALLY_RECEIVED", "RECEIVED", "CLOSED", "CANCELLED"],
    explain: "Ordered against received against pending, with overdue deliveries surfaced rather than discovered.",
  },
  grns: {
    placeholder: "Search receipt or challan number…",
    label: "Status",
    options: ["DRAFT", "INSPECTED", "POSTED", "CANCELLED"],
    explain: "Only the accepted quantity enters the stock ledger. Rejected and short quantities stay on the record but never become stock.",
  },
  vendors: {
    placeholder: "Search vendor name or code…",
    label: "Status",
    options: ["ACTIVE", "INACTIVE"],
    explain: "Suppliers, with their GST registration, payment terms and order history.",
  },
  items: {
    placeholder: "Search item name or code…",
    label: "Status",
    options: ["ACTIVE", "INACTIVE"],
    explain: "The item master every indent, purchase order, receipt and issue refers to.",
  },
};

export function ProcurementScreen({
  tab, tabs, query, filterA, showMoney, can, indents, pos, grns, vendors, items, nowMs,
}: {
  /** Server render time, so "overdue" is identical on both sides of hydration. */
  nowMs: number;
  tab: ProcTab;
  tabs: Array<{ key: ProcTab; label: string }>;
  query: string;
  filterA: string;
  filterB: string;
  showMoney: boolean;
  can: Record<string, boolean>;
  indents: IndentRow[];
  pos: PoRow[];
  grns: GrnRow[];
  vendors: VendorRow[];
  items: ItemRow[];
}) {
  const router = useRouter();
  const params = useSearchParams();
  const cfg = FILTERS[tab];

  function setParam(next: Record<string, string | undefined>) {
    const sp = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(next)) {
      if (!v || v === "all") sp.delete(k);
      else sp.set(k, v);
    }
    router.push(`?${sp.toString()}`);
  }

  const counts: Record<ProcTab, number> = {
    indents: indents.length, pos: pos.length, grns: grns.length,
    vendors: vendors.length, items: items.length,
  };
  const filtersActive = Boolean(query) || filterA !== "all";

  const newHref =
    tab === "indents" ? "/material/indents/new"
    : tab === "pos" ? "/material/purchase-orders/new"
    : tab === "grns" ? "/material/grn/new"
    : tab === "vendors" ? "/masters/vendors"
    : "/masters/items";

  const canCreate =
    (tab === "indents" && can.createIndent) ||
    (tab === "pos" && can.createPo) ||
    (tab === "grns" && can.createGrn) ||
    tab === "vendors" || tab === "items";

  return (
    <div className="animate-fade-up">
      {/* Chain explainer, as in the design */}
      <div className="mb-4 flex items-center gap-2">
        <p className="flex-1 text-[11.5px] font-medium leading-relaxed text-muted-400">
          Indent (internal request to store) → PM approval → store stock check → issue from stock, or
          purchase order to vendor for the shortfall → goods receipt → three-way match → payment.
        </p>
        {canCreate && (
          <Link href={newHref}>
            <Button size="md">
              <Plus className="h-3.5 w-3.5" />
              New
            </Button>
          </Link>
        )}
      </div>

      {/* Tabs */}
      <div className="mb-3.5 flex flex-wrap gap-1.5">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setParam({ tab: t.key, q: undefined, a: undefined })}
            className={cn(
              "rounded-[9px] px-3.5 py-2 text-[12px] font-bold transition-colors",
              tab === t.key
                ? "bg-navy-950 text-brand-300"
                : "border border-line-400 bg-white text-muted-600 hover:bg-surface-hover hover:text-navy-950",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Filter bar */}
      <div className="mb-3.5 flex flex-wrap items-center gap-2.5 rounded-[12px] border border-line-400 bg-white px-3.5 py-3">
        <Input
          defaultValue={query}
          placeholder={cfg.placeholder}
          className="min-w-[230px] flex-1 bg-white"
          onKeyDown={(e) => {
            if (e.key === "Enter") setParam({ q: (e.target as HTMLInputElement).value });
          }}
        />
        <span className="text-[11px] font-semibold text-muted-400">{cfg.label}</span>
        <Select
          value={filterA}
          onChange={(e) => setParam({ a: e.target.value })}
          className="w-auto min-w-[150px] bg-white"
        >
          <option value="all">All</option>
          {cfg.options.map((o) => (
            <option key={o} value={o}>{o.replace(/_/g, " ")}</option>
          ))}
        </Select>
        <span className="text-[11.5px] font-semibold text-muted-600">
          {counts[tab]} shown
        </span>
        {filtersActive && (
          <button
            type="button"
            onClick={() => setParam({ q: undefined, a: undefined })}
            className="rounded-[8px] border border-bad-050 bg-bad-050 px-3 py-1.5 text-[11.5px] font-semibold text-bad-600 hover:brightness-95"
          >
            Clear filters
          </button>
        )}
      </div>

      {/* ------------------------------- Indents ------------------------------ */}
      {tab === "indents" && (
        <>
          <Card className="overflow-x-auto">
            {indents.length === 0 ? (
              <EmptyState title="No indents match" description={cfg.explain} />
            ) : (
              indents.map((i) => {
                const stage = chainStage(i.status);
                const terminal = ["REJECTED", "CANCELLED"].includes(i.status);
                return (
                  <div
                    key={i.id}
                    className="grid min-w-[900px] items-center gap-3 border-b border-line-100 px-[18px] py-3.5 last:border-0 hover:bg-surface-tint"
                    style={{ gridTemplateColumns: "minmax(190px,1.4fr) minmax(140px,1fr) 170px 150px 118px 90px" }}
                  >
                    <div className="min-w-0">
                      <div className="truncate text-[13px] font-semibold text-navy-900">{i.title}</div>
                      <div className="mt-0.5 truncate text-[11.5px] font-medium text-muted-400">
                        {i.ref} · {i.project} · by {i.by} · raised {formatDate(i.raisedAt)}
                      </div>
                    </div>

                    <div className="text-[12px] font-medium text-navy-500">
                      Required by <b className="text-navy-600">{formatDate(i.requiredBy)}</b>
                      <div className="text-[11px] text-muted-400">
                        {i.activity ?? `${i.lineCount} line${i.lineCount === 1 ? "" : "s"}`}
                      </div>
                    </div>

                    {/* The approval chain */}
                    <div className="flex items-center gap-1">
                      {CHAIN_STEPS.map((s, n) => {
                        const done = !terminal && n < stage;
                        const current = !terminal && n === stage;
                        return (
                          <React.Fragment key={s.key}>
                            <span
                              title={s.name}
                              className={cn(
                                "grid h-[22px] min-w-[22px] place-items-center rounded-full px-1 text-[9.5px] font-bold",
                                terminal
                                  ? "bg-bad-050 text-bad-600"
                                  : done
                                    ? "bg-good-600 text-white"
                                    : current
                                      ? "bg-brand-500 text-white ring-4 ring-brand-100"
                                      : "bg-line-400 text-muted-500",
                              )}
                            >
                              {s.short}
                            </span>
                            {n < CHAIN_STEPS.length - 1 && (
                              <span
                                className={cn(
                                  "inline-block h-[2px] w-3",
                                  done ? "bg-good-600" : "bg-[#D9DEED]",
                                )}
                              />
                            )}
                          </React.Fragment>
                        );
                      })}
                    </div>

                    <div>
                      {i.fromStock > 0 || i.toBuy > 0 ? (
                        <>
                          <Badge tone={i.toBuy > 0 ? "warn" : "good"}>
                            {i.toBuy > 0 ? "Part purchase" : "From stock"}
                          </Badge>
                          <div className="num mt-1 text-[11px] font-semibold text-muted-600">
                            {qty(i.fromStock, 2)} issued · {qty(i.toBuy, 2)} to buy
                          </div>
                        </>
                      ) : (
                        <span className="text-[11px] font-medium text-muted-400">
                          Stock check pending
                        </span>
                      )}
                    </div>

                    <Badge tone={STATUS_TONE[i.status] ?? "slate"}>
                      {i.status.replace(/_/g, " ")}
                    </Badge>

                    <div className="flex justify-end">
                      <Link href={`/material/indents/${i.id}`}>
                        <Button size="xs">View</Button>
                      </Link>
                    </div>
                  </div>
                );
              })
            )}
          </Card>
          <p className="mt-3 text-[12px] font-medium leading-relaxed text-muted-400">{cfg.explain}</p>
        </>
      )}

      {/* ---------------------------- Purchase orders ------------------------- */}
      {tab === "pos" && (
        <Card className="overflow-x-auto">
          {pos.length === 0 ? (
            <EmptyState title="No purchase orders match" description={cfg.explain} />
          ) : (
            <table className="w-full min-w-[860px] border-collapse">
              <thead>
                <tr className="bg-surface-sunken">
                  {[
                    "Purchase order", "Vendor", "Received", "Expected",
                    ...(showMoney ? ["Value"] : []), "Status", "Actions",
                  ].map((h) => (
                    <th
                      key={h}
                      className="border-b border-line-300 px-4 py-3 text-left text-[10.5px] font-bold uppercase tracking-[.08em] text-muted-500"
                    >
                      {h === "Actions" ? "" : h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pos.map((o) => {
                  const pct = o.ordered > 0 ? Math.round((o.received / o.ordered) * 100) : 0;
                  const overdue =
                    o.expectedDate &&
                    new Date(o.expectedDate).getTime() < nowMs &&
                    !["RECEIVED", "CLOSED", "CANCELLED"].includes(o.status);
                  return (
                    <tr key={o.id} className="border-b border-[#F0F3FA] last:border-0 hover:bg-surface-tint">
                      <td className="px-4 py-3">
                        <Link href={`/material/purchase-orders/${o.id}`} className="text-[12.5px] font-bold text-navy-950 hover:text-brand-500">
                          {o.no}
                        </Link>
                        <div className="mt-0.5 text-[11px] font-medium text-muted-400">
                          {o.indentNo ? `from ${o.indentNo} · ` : ""}{formatDate(o.poDate)}
                        </div>
                        <div className="mt-0.5 text-[10.5px] font-medium text-muted-300">
                          {o.grnCount} receipt(s) · {o.invoiceCount} invoice(s)
                        </div>
                      </td>
                      <td className="px-4 py-3 text-[12px] font-semibold text-navy-600">
                        {o.vendor}
                        <div className="text-[11px] font-medium text-muted-400">{o.project}</div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="num text-[12px] font-semibold text-navy-600">{pct}%</div>
                        <div className="mt-1 h-[5px] w-[70px] overflow-hidden rounded-full bg-[#EDF0F8]">
                          <div
                            className={cn("h-full rounded-full", pct === 100 ? "bg-good-600" : "bg-brand-500")}
                            style={{ width: `${Math.max(3, pct)}%` }}
                          />
                        </div>
                      </td>
                      <td className={cn("px-4 py-3 text-[12px] font-medium", overdue ? "text-bad-600" : "text-muted-600")}>
                        {formatDate(o.expectedDate)}
                        {overdue && <div className="text-[10.5px] font-bold">overdue</div>}
                      </td>
                      {showMoney && (
                        <td className="num px-4 py-3 text-[12.5px] font-bold text-navy-950">{money(o.total)}</td>
                      )}
                      <td className="px-4 py-3">
                        <Badge tone={STATUS_TONE[o.status] ?? "slate"}>{o.status.replace(/_/g, " ")}</Badge>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Link href={`/material/purchase-orders/${o.id}`}>
                          <Button size="xs" variant="secondary">Open</Button>
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </Card>
      )}

      {/* ----------------------------- Goods receipt -------------------------- */}
      {tab === "grns" && (
        <Card className="overflow-x-auto">
          {grns.length === 0 ? (
            <EmptyState title="Nothing received yet" description={cfg.explain} />
          ) : (
            grns.map((g) => (
              <div
                key={g.id}
                className="flex flex-wrap items-center gap-3 border-b border-line-100 px-[18px] py-3.5 last:border-0 hover:bg-surface-tint"
              >
                <div className="min-w-[200px] flex-1">
                  <Link href={`/material/grn/${g.id}`} className="text-[13px] font-bold text-navy-950 hover:text-brand-500">
                    {g.no}
                  </Link>
                  <div className="mt-0.5 text-[11.5px] font-medium text-muted-400">
                    against{" "}
                    <Link href={`/material/purchase-orders/${g.poId}`} className="text-brand-600 hover:underline">
                      {g.poNo}
                    </Link>{" "}
                    · {g.vendor} · {g.store}
                    {g.challanNo && ` · challan ${g.challanNo}`}
                  </div>
                </div>
                <div className="num text-right text-[11.5px] font-semibold">
                  <div className="text-good-700">{qty(g.accepted, 2)} accepted</div>
                  {g.rejected > 0 && <div className="text-bad-600">{qty(g.rejected, 2)} rejected</div>}
                  <div className="text-muted-400">of {qty(g.received, 2)} received</div>
                </div>
                <div className="text-[11.5px] font-medium text-muted-600">{formatDate(g.grnDate)}</div>
                <Badge tone={STATUS_TONE[g.status] ?? "slate"}>{g.status}</Badge>
              </div>
            ))
          )}
        </Card>
      )}

      {/* -------------------------------- Vendors ----------------------------- */}
      {tab === "vendors" && (
        <Card className="overflow-x-auto">
          {vendors.length === 0 ? (
            <EmptyState title="No vendors match" description={cfg.explain} />
          ) : (
            <table className="w-full min-w-[820px] border-collapse">
              <thead>
                <tr className="bg-surface-sunken">
                  {["Vendor", "Contact", "GSTIN", "Terms", "Orders", "Status"].map((h) => (
                    <th key={h} className="border-b border-line-300 px-4 py-3 text-left text-[10.5px] font-bold uppercase tracking-[.08em] text-muted-500">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {vendors.map((v) => (
                  <tr key={v.id} className="border-b border-[#F0F3FA] last:border-0 hover:bg-surface-tint">
                    <td className="px-4 py-3">
                      <div className="text-[12.5px] font-bold text-navy-950">{v.name}</div>
                      <div className="text-[11px] font-medium text-muted-400">
                        {v.code}{v.city && ` · ${v.city}`}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-[12px] font-medium text-navy-600">
                      {v.contact ?? "—"}
                      <div className="text-[11px] text-muted-400">{v.phone ?? ""}</div>
                    </td>
                    <td className="px-4 py-3 text-[11.5px] font-medium text-muted-600">{v.gstin ?? "—"}</td>
                    <td className="px-4 py-3 text-[11.5px] font-medium text-muted-600">{v.term ?? "—"}</td>
                    <td className="num px-4 py-3 text-[12px] font-semibold text-navy-600">
                      {v.poCount} PO · {v.invoiceCount} inv
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone={STATUS_TONE[v.status] ?? "slate"}>{v.status}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      )}

      {/* --------------------------------- Items ------------------------------ */}
      {tab === "items" && (
        <Card className="overflow-x-auto">
          {items.length === 0 ? (
            <EmptyState title="No items match" description={cfg.explain} />
          ) : (
            <table className="w-full min-w-[820px] border-collapse">
              <thead>
                <tr className="bg-surface-sunken">
                  {["Item", "Category", "On hand", "Reorder level", "Standard rate", "Status"].map((h) => (
                    <th key={h} className="border-b border-line-300 px-4 py-3 text-left text-[10.5px] font-bold uppercase tracking-[.08em] text-muted-500">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {items.map((i) => {
                  const low = i.reorderLevel > 0 && i.onHand <= i.reorderLevel;
                  return (
                    <tr key={i.id} className="border-b border-[#F0F3FA] last:border-0 hover:bg-surface-tint">
                      <td className="px-4 py-3">
                        <div className="text-[12.5px] font-bold text-navy-950">{i.name}</div>
                        <div className="text-[11px] font-medium text-muted-400">{i.code}</div>
                      </td>
                      <td className="px-4 py-3 text-[11.5px] font-medium text-muted-600">{i.category}</td>
                      <td className={cn("num px-4 py-3 text-[12px] font-bold", low ? "text-bad-600" : "text-navy-600")}>
                        {qty(i.onHand, 2)} {i.uom}
                        {low && <div className="text-[10px] font-bold uppercase">below level</div>}
                      </td>
                      <td className="num px-4 py-3 text-[11.5px] font-medium text-muted-600">
                        {qty(i.reorderLevel, 2)}
                      </td>
                      <td className="num px-4 py-3 text-[12px] font-semibold text-navy-600">
                        {money(i.standardRate)}
                      </td>
                      <td className="px-4 py-3">
                        <Badge tone={STATUS_TONE[i.status] ?? "slate"}>{i.status}</Badge>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </Card>
      )}
    </div>
  );
}
