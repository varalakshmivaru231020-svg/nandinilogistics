import { prisma } from "@/lib/db";
import { capRows, EXPORT_MAX_ROWS, exportGate, exportResponse } from "@/lib/exports/respond";
import { PERM } from "@/lib/permissions/codes";
import type { ReportColumn } from "@/lib/reports/types";
import { customerListWhere, describeCustomerFilters, readCustomerListParams } from "@/lib/sales/customer-list";

export const dynamic = "force-dynamic";

/**
 * Exports the Customers list — every customer matching the screen's search and
 * filters. Phone and PAN follow the screen: hidden without `viewKyc`.
 */
export async function GET(request: Request) {
  const gate = await exportGate(request, PERM.sales.customer.view, PERM.sales.customer.export);
  if (!gate.ok) return gate.response;
  const { ctx, params: query } = gate;

  const params = readCustomerListParams(query);
  const canSeeKyc = ctx.has(PERM.sales.customer.viewKyc);

  const found = await prisma.customer.findMany({
    where: customerListWhere(params, canSeeKyc),
    orderBy: { createdAt: "desc" },
    take: EXPORT_MAX_ROWS + 1,
    include: {
      bookings: {
        select: { bookingNo: true, status: true, totalAmount: true, receivedAmount: true, unit: { select: { unitNumber: true } } },
      },
    },
  });
  const { rows, note } = capRows(found);

  const columns: ReportColumn[] = [
    { key: "customerNo", header: "Customer No" },
    { key: "name", header: "Name" },
    { key: "phone", header: "Phone" },
    { key: "email", header: "Email" },
    ...(canSeeKyc
      ? [{ key: "pan", header: "PAN" }, { key: "address", header: "Address" }]
      : []),
    { key: "bookings", header: "Bookings" },
    { key: "units", header: "Units" },
    { key: "bookedValue", header: "Booked value", align: "right", format: "money" },
    { key: "received", header: "Received", align: "right", format: "money" },
    { key: "kyc", header: "KYC" },
    { key: "kycVerifiedAt", header: "KYC verified on", format: "date" },
    { key: "createdAt", header: "Created on", format: "date" },
  ];

  const filters = describeCustomerFilters(params) + (canSeeKyc ? "" : " · Phone and PAN hidden");

  return exportResponse({
    ctx,
    format: gate.format,
    title: "Customers",
    entity: "Customer",
    filters,
    result: {
      columns,
      rows: rows.map((c) => {
        const live = c.bookings.filter((b) => b.status !== "CANCELLED");
        return {
          id: c.id,
          customerNo: c.customerNo,
          name: c.name,
          phone: canSeeKyc ? c.phone : "(hidden)",
          email: c.email ?? "",
          ...(canSeeKyc ? { pan: c.panNumber ?? "", address: c.addressLine ?? "" } : {}),
          bookings: c.bookings.map((b) => b.bookingNo).join(", "),
          units: c.bookings.map((b) => b.unit.unitNumber + (b.status === "CANCELLED" ? " (cancelled)" : "")).join(", "),
          bookedValue: live.reduce((s, b) => s + Number(b.totalAmount), 0),
          received: live.reduce((s, b) => s + Number(b.receivedAmount), 0),
          kyc: c.kycVerifiedAt ? "Verified" : "Pending",
          kycVerifiedAt: c.kycVerifiedAt,
          createdAt: c.createdAt,
        };
      }),
      summary: [{ label: "Customers", value: note }],
      emptyMessage: "No customers match these filters.",
    },
  });
}
