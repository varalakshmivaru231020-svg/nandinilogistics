import { requirePermission } from "@/lib/rbac/guard";
import { prisma } from "@/lib/db";
import { PERM } from "@/lib/permissions/codes";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";

export const metadata = { title: "Vendors" };

/**
 * The design's vendor directory. Its header says rating and on-time delivery
 * are tracked from goods-receipt history, so neither is a field somebody types:
 * on-time is computed here from receipts against each order's expected date.
 */
export default async function VendorsPage() {
  const ctx = await requirePermission(PERM.material.vendor.view);
  const showPerformance = ctx.has(PERM.material.vendor.viewPerformance);

  const vendors = await prisma.vendor.findMany({
    orderBy: [{ status: "asc" }, { name: "asc" }],
    include: {
      categories: { include: { category: { select: { name: true } } } },
      purchaseOrders: {
        select: {
          expectedDate: true,
          grns: { where: { status: "POSTED" }, select: { grnDate: true }, orderBy: { grnDate: "asc" }, take: 1 },
        },
      },
    },
  });

  const active = vendors.filter((v) => v.status === "ACTIVE").length;

  const rows = vendors.map((v) => {
    // A delivery counts only where both a promise and a posted receipt exist.
    const judged = v.purchaseOrders.filter((p) => p.expectedDate && p.grns.length > 0);
    const onTime = judged.filter((p) => p.grns[0].grnDate <= p.expectedDate!).length;
    return {
      ...v,
      deliveries: judged.length,
      onTimePct: judged.length ? Math.round((onTime / judged.length) * 100) : null,
    };
  });

  return (
    <div className="mx-auto max-w-[1400px]">
      <PageHeader
        title="Vendors"
        description={`${vendors.length} vendor${vendors.length === 1 ? "" : "s"} · ${active} active · rating and on-time delivery are tracked from goods-receipt history`}
      />

      {rows.length === 0 ? (
        <Card>
          <EmptyState
            title="No vendors yet"
            description="Vendors are created under Masters → Vendors; their performance appears here."
          />
        </Card>
      ) : (
        <div className="space-y-2.5">
          {rows.map((v) => (
            <div
              key={v.id}
              className="rounded-[13px] border border-line-400 bg-white px-[18px] py-4 transition-shadow hover:shadow-[0_6px_18px_rgba(25,26,92,.07)]"
            >
              <div className="flex flex-wrap items-start gap-3.5">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[11px] bg-navy-950 text-[13px] font-bold text-brand-300">
                  {v.name.slice(0, 2).toUpperCase()}
                </span>

                <div className="min-w-[200px] flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-display text-[14px] font-bold text-navy-950">{v.name}</span>
                    <span className="num text-[11px] font-semibold text-muted-400">{v.code}</span>
                    <Badge tone={v.status === "ACTIVE" ? "good" : "muted"}>{v.status}</Badge>
                  </div>
                  <p className="mt-0.5 text-[11.5px] font-medium text-muted-500">
                    {[v.contactPerson, v.phone].filter(Boolean).join(" · ") || "No contact recorded"}
                  </p>
                  {v.email && <p className="text-[11.5px] font-medium text-muted-400">{v.email}</p>}
                </div>

                {showPerformance && (
                  <div className="shrink-0 text-right">
                    <div className="text-[13px] font-bold text-warn-700">
                      ★ {v.rating ?? "—"}
                    </div>
                    <div
                      className={cn(
                        "text-[11.5px] font-semibold",
                        v.onTimePct === null
                          ? "text-muted-400"
                          : v.onTimePct >= 90
                            ? "text-good-700"
                            : v.onTimePct >= 70
                              ? "text-warn-700"
                              : "text-bad-600",
                      )}
                    >
                      {v.onTimePct === null ? "no deliveries yet" : `${v.onTimePct}% on-time`}
                    </div>
                    {v.deliveries > 0 && (
                      <div className="text-[10.5px] font-medium text-muted-400">
                        across {v.deliveries} deliver{v.deliveries === 1 ? "y" : "ies"}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {v.categories.length > 0 && (
                <div className="mt-2.5 flex flex-wrap gap-1.5">
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

              <div className="mt-2.5 border-t border-line-200 pt-2.5">
                <p className="text-[10px] font-bold uppercase tracking-[.1em] text-muted-400">GSTIN · PAN</p>
                <p className="num mt-0.5 text-[11.5px] font-semibold text-navy-600">
                  {v.gstin ?? "—"} · {v.pan ?? "—"}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
