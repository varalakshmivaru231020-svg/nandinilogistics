import { requirePermission } from "@/lib/rbac/guard";
import { prisma } from "@/lib/db";
import { PERM } from "@/lib/permissions/codes";
import { onTimeStats, readVendorListParams, vendorListWhere } from "@/lib/material/list-filters";
import { categoryOptions } from "@/lib/material/list-options";
import { ListToolbar } from "@/components/list/list-toolbar";
import { ListNote } from "@/components/list/list-note";
import Link from "next/link";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui/primitives";
import { cn, moneyShort } from "@/lib/utils";

export const metadata = { title: "Vendors" };

/**
 * The design's vendor directory. Its header says rating and on-time delivery
 * are tracked from goods-receipt history, so neither is a field somebody types:
 * on-time is computed here from receipts against each order's expected date.
 */
const AVATAR_COLOURS = ["#0089C9", "#2F308C", "#1F9D66", "#E8A13A"];

export default async function VendorsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await requirePermission(PERM.material.vendor.view);
  const showPerformance = ctx.has(PERM.material.vendor.viewPerformance);
  const raw = await searchParams;
  const params = readVendorListParams(raw);
  const filtered = Boolean(params.q || params.status || params.category);


  const [vendors, categories] = await Promise.all([
    prisma.vendor.findMany({
      // Shared with the export, so a download holds exactly what this screen shows.
      where: vendorListWhere(params),
      orderBy: [{ status: "asc" }, { name: "asc" }],
      include: {
        categories: { include: { category: { select: { name: true } } } },
        paymentTerm: { select: { name: true } },
        purchaseOrders: {
          select: {
            expectedDate: true,
            totalAmount: true,
            grns: { where: { status: "POSTED" }, select: { grnDate: true }, orderBy: { grnDate: "asc" }, take: 1 },
          },
        },
      },
    }),
    categoryOptions(),
  ]);

  const active = vendors.filter((v) => v.status === "ACTIVE").length;

  const rows = vendors.map((v) => ({
    ...v,
    spend: v.purchaseOrders.reduce((n, p) => n + Number(p.totalAmount), 0),
    ...onTimeStats(
      v.purchaseOrders.map((p) => ({ expectedDate: p.expectedDate, firstPostedGrnDate: p.grns[0]?.grnDate ?? null })),
    ),
  }));

  return (
    <div>
      <PageHeader
        actions={
          ctx.has(PERM.masters.vendor.create) ? (
            <Link
              href="/material/vendors/new"
              className="rounded-[9px] bg-brand-500 px-[15px] py-[9px] text-[12px] font-bold text-white transition-colors hover:bg-brand-600"
            >
              + New vendor
            </Link>
          ) : null
        }
        title="Vendors"
        description="Indent (internal request to store) → PM approval → store stock check → issue from stock, or PO to vendor for the shortfall → GRN → 3-way match"
      />

      <ListToolbar
        searchPlaceholder="Search vendor, contact, mobile, GSTIN…"
        filters={[
          {
            name: "status",
            label: "Status",
            options: [
              { value: "ACTIVE", label: "Active" },
              { value: "INACTIVE", label: "On hold" },
            ],
          },
          { name: "category", label: "Category", options: categories },
        ]}
      />

      <p className="mb-[13px] text-[13px] font-medium text-muted-600">
        {vendors.length} vendor{vendors.length === 1 ? "" : "s"} · {active} active · rating and
        on-time delivery are tracked from GRN history
      </p>

      {rows.length === 0 ? (
        <Card>
          <EmptyState
            title={filtered ? "No vendors match these filters" : "No vendors yet"}
          />
        </Card>
      ) : (
        <div className="grid gap-3.5 [grid-template-columns:repeat(auto-fill,minmax(400px,1fr))]">
          {rows.map((v, i) => (
            <div key={v.id} className="rounded-[13px] border border-line-400 bg-white px-[18px] py-[17px]">
              <div className="flex items-start gap-3">
                <span
                  className="grid h-[38px] w-[38px] shrink-0 place-items-center rounded-[10px] text-[12px] font-bold text-white"
                  style={{ background: AVATAR_COLOURS[i % AVATAR_COLOURS.length] }}
                >
                  {v.name.slice(0, 2).toUpperCase()}
                </span>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-[9px]">
                    <span className="font-display text-[14.5px] font-bold text-navy-950">{v.name}</span>
                    <span className="num rounded-full border border-[#DDE4F3] bg-surface-hover px-2 py-[3px] text-[10px] font-bold tracking-[.05em] text-navy-800">
                      {v.code}
                    </span>
                    <Badge tone={v.status === "ACTIVE" ? "good" : "warn"}>
                      {v.status === "ACTIVE" ? "Active" : "On hold"}
                    </Badge>
                  </div>
                  <p className="mt-[3px] text-[11.5px] font-medium text-muted-500">
                    {[v.contactPerson, v.phone].filter(Boolean).join(" · ") || "No contact recorded"}
                  </p>
                  {v.email && <p className="text-[11.5px] font-medium text-muted-400">{v.email}</p>}
                </div>

                {showPerformance && (
                  <div className="shrink-0 text-right">
                    <div className="font-display text-[16px] font-extrabold text-navy-950">★ {v.rating ?? "—"}</div>
                    <div
                      className={cn(
                        "text-[12.5px] font-bold",
                        v.onTimePct === null
                          ? "text-muted-400"
                          : v.onTimePct >= 90
                            ? "text-good-700"
                            : v.onTimePct >= 85
                              ? "text-warn-700"
                              : "text-bad-700",
                      )}
                    >
                      {v.onTimePct === null ? "no deliveries yet" : `${v.onTimePct}% on-time`}
                    </div>
                  </div>
                )}
              </div>

              {v.categories.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {v.categories.map((c) => (
                    <span
                      key={c.id}
                      className="rounded-full border border-line-400 bg-surface-field px-[11px] py-[5px] text-[11px] font-semibold text-navy-600"
                    >
                      {c.category.name}
                    </span>
                  ))}
                </div>
              )}

              <div className="mt-[13px] grid grid-cols-2 gap-2.5">
                <div className="rounded-[10px] border border-line-200 bg-surface-tint px-3 py-2.5">
                  <p className="text-[10px] font-semibold uppercase tracking-[.06em] text-muted-400">GSTIN · PAN</p>
                  <p className="num mt-[3px] text-[11.5px] font-semibold text-navy-900">{v.gstin ?? "—"}</p>
                  <p className="num text-[11px] font-medium text-muted-500">{v.pan ?? "—"}</p>
                </div>
                <div className="rounded-[10px] border border-line-200 bg-surface-tint px-3 py-2.5">
                  <p className="text-[10px] font-semibold uppercase tracking-[.06em] text-muted-400">Terms · POs</p>
                  <p className="mt-[3px] text-[11.5px] font-semibold text-navy-900">{v.paymentTerm?.name ?? "—"}</p>
                  <p className="text-[11px] font-medium text-muted-500">
                    {v.purchaseOrders.length} PO{v.purchaseOrders.length === 1 ? "" : "s"}
                    {showPerformance && ` · ${moneyShort(v.spend)} spend`}
                  </p>
                </div>
              </div>

              <div className="mt-[13px]">
                <Link
                  href={`/material/vendors/${v.id}`}
                  className="block w-full rounded-[8px] bg-brand-500 py-2.5 text-center text-[11.5px] font-bold text-white transition-colors hover:bg-brand-600"
                >
                  View
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}

      <ListNote>
        A PO can only be raised against an active vendor. Vendors on hold stay visible for history but cannot receive new orders.
      </ListNote>
    </div>
  );
}
