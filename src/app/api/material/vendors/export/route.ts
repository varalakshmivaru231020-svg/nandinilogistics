import { prisma } from "@/lib/db";
import { capRows, exportGate, exportResponse } from "@/lib/exports/respond";
import {
  describeParts, enumWords, onTimeStats, readVendorListParams, searchWords, vendorListWhere,
} from "@/lib/material/list-filters";
import { categoryLabel } from "@/lib/material/list-options";
import { PERM } from "@/lib/permissions/codes";
import type { ReportColumn } from "@/lib/reports/types";

export const dynamic = "force-dynamic";

/**
 * The vendor directory matching the screen's filters, under the vendor
 * master's export permission. Rating and on-time delivery appear only for
 * someone who may see vendor performance, as on screen.
 */
export async function GET(request: Request) {
  const gate = await exportGate(request, PERM.material.vendor.view, PERM.masters.vendor.export);
  if (!gate.ok) return gate.response;
  const { ctx } = gate;
  const params = readVendorListParams(gate.params);
  const showPerformance = ctx.has(PERM.material.vendor.viewPerformance);

  const vendors = await prisma.vendor.findMany({
    where: vendorListWhere(params),
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
  const { rows, note } = capRows(vendors);

  const filters = describeParts(
    [searchWords(params.q), enumWords("Status", params.status), await categoryLabel(params.category)],
    "All vendors",
  );

  const columns: ReportColumn[] = [
    { key: "code", header: "Code" },
    { key: "name", header: "Vendor" },
    { key: "contactPerson", header: "Contact person" },
    { key: "phone", header: "Phone" },
    { key: "email", header: "Email" },
    { key: "gstin", header: "GSTIN" },
    { key: "pan", header: "PAN" },
    { key: "categories", header: "Supplies" },
    { key: "status", header: "Status" },
    ...(showPerformance
      ? ([
          { key: "rating", header: "Rating", align: "right", format: "number" },
          { key: "onTimePct", header: "On-time delivery", align: "right", format: "percent" },
          { key: "deliveries", header: "Deliveries judged", align: "right", format: "number" },
        ] satisfies ReportColumn[])
      : []),
  ];

  return exportResponse({
    ctx,
    params: gate.params,
    format: gate.format,
    title: "Vendors",
    entity: "Vendor",
    filters,
    result: {
      columns,
      rows: rows.map((v) => {
        const perf = showPerformance
          ? onTimeStats(
              v.purchaseOrders.map((p) => ({
                expectedDate: p.expectedDate,
                firstPostedGrnDate: p.grns[0]?.grnDate ?? null,
              })),
            )
          : null;
        return {
          id: v.id,
          code: v.code,
          name: v.name,
          contactPerson: v.contactPerson ?? "",
          phone: v.phone ?? "",
          email: v.email ?? "",
          gstin: v.gstin ?? "",
          pan: v.pan ?? "",
          categories: v.categories.map((c) => c.category.name).join(", "),
          status: v.status === "ACTIVE" ? "Active" : "Inactive",
          ...(perf ? { rating: v.rating, onTimePct: perf.onTimePct, deliveries: perf.deliveries } : {}),
        };
      }),
      summary: [{ label: "Vendors", value: note }],
      emptyMessage: "No vendors match these filters.",
    },
  });
}
