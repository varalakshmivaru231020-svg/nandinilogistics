import { prisma } from "@/lib/db";
import { capRows, EXPORT_MAX_ROWS, exportGate, exportResponse, listWindow } from "@/lib/exports/respond";
import { type ScreenShell } from "@/lib/screens/rows";
import { bookingEmpty, bookingScreenRow } from "@/lib/screens/rows/booking";
import { PERM } from "@/lib/permissions/codes";
import { projectScopeFilter } from "@/lib/rbac/context";
import type { ReportResult } from "@/lib/reports/types";
import { bookingListWhere, describeBookingFilters, readBookingListParams } from "@/lib/sales/booking-list";

export const dynamic = "force-dynamic";

/**
 * Exports the Bookings list — every booking in the caller's projects matching
 * the screen's search, status, project and booking-date filters.
 */
export async function GET(request: Request) {
  const gate = await exportGate(request, PERM.sales.booking.view, PERM.sales.booking.export);
  if (!gate.ok) return gate.response;
  const { ctx, params: query } = gate;

  const params = readBookingListParams(query);
  const now = new Date();

  const found = await prisma.booking.findMany({
    where: bookingListWhere(ctx, params),
    orderBy: { bookingDate: "desc" },
    take: EXPORT_MAX_ROWS + 1,
    include: {
      unit: { select: { unitNumber: true } },
      customer: { select: { name: true, phone: true } },
      project: { select: { code: true } },
      soldBy: { select: { name: true } },
      demands: { select: { status: true, dueDate: true, totalAmount: true, receivedAmount: true } },
    },
  });
  const { rows, note } = capRows(found);

  /* The screen, for the app: the booking row the table draws, overdue read
   * from its own demands as the screen reads them. */
  let screen: ScreenShell | undefined;
  if (gate.format === "json") {
    const { from, to } = listWindow(gate.params, rows.length);
    screen = {
      rows: rows.slice(from, to).map((b) =>
        bookingScreenRow({
          id: b.id,
          bookingNo: b.bookingNo,
          status: b.status,
          bookingDate: b.bookingDate,
          projectCode: b.project.code,
          unitNumber: b.unit.unitNumber,
          customerName: b.customer.name,
          customerPhone: b.customer.phone,
          soldBy: b.soldBy?.name ?? null,
          totalAmount: Number(b.totalAmount),
          receivedAmount: Number(b.receivedAmount),
          overdueAmount: b.demands
            .filter((d) => ["RAISED", "PARTIALLY_PAID"].includes(d.status) && d.dueDate < now)
            .reduce((s, d) => s + (Number(d.totalAmount) - Number(d.receivedAmount)), 0),
        }),
      ),
      empty: bookingEmpty(
        Boolean(params.q || params.status || params.project || params.from || params.to),
      ),
    };
  }

  const result: ReportResult = {
    columns: [
      { key: "bookingNo", header: "Booking No" },
      { key: "project", header: "Project" },
      { key: "unit", header: "Unit" },
      { key: "customer", header: "Customer" },
      { key: "phone", header: "Customer phone" },
      { key: "bookingDate", header: "Booking date", format: "date" },
      { key: "value", header: "Value", align: "right", format: "money" },
      { key: "collected", header: "Collected", align: "right", format: "money" },
      { key: "collectedPct", header: "Collected %", align: "right", format: "percent" },
      { key: "balance", header: "Balance", align: "right", format: "money" },
      { key: "overdue", header: "Overdue", align: "right", format: "money" },
      { key: "soldBy", header: "Sold by" },
      { key: "status", header: "Status" },
    ],
    rows: rows.map((b) => {
      const total = Number(b.totalAmount);
      const received = Number(b.receivedAmount);
      const overdue = b.demands
        .filter((d) => ["RAISED", "PARTIALLY_PAID"].includes(d.status) && d.dueDate < now)
        .reduce((s, d) => s + (Number(d.totalAmount) - Number(d.receivedAmount)), 0);
      return {
          id: b.id,
        bookingNo: b.bookingNo,
        project: b.project.code,
        unit: b.unit.unitNumber,
        customer: b.customer.name,
        phone: b.customer.phone,
        bookingDate: b.bookingDate,
        value: total,
        collected: received,
        collectedPct: total > 0 ? Math.round((received / total) * 100) : 0,
        balance: total - received,
        overdue,
        soldBy: b.soldBy?.name ?? "",
        status: b.status.charAt(0) + b.status.slice(1).toLowerCase(),
      };
    }),
    summary: [{ label: "Bookings", value: note }],
    emptyMessage: "No bookings match these filters.",
  };

  const projectLabel = params.project
    ? (await prisma.project.findFirst({
        where: { id: params.project, ...projectScopeFilter(ctx, "id") },
        select: { code: true },
      }))?.code ?? null
    : null;

  return exportResponse({
    ctx,
    params: gate.params,
    format: gate.format,
    title: "Bookings",
    entity: "Booking",
    filters: describeBookingFilters(params, projectLabel ? `Project ${projectLabel}` : null),
    result,
    screen,
    projectId: projectLabel ? params.project : null,
  });
}
