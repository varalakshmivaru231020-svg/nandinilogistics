import { prisma } from "@/lib/db";
import { capRows, exportGate, exportResponse, listWindow } from "@/lib/exports/respond";
import { bandOf, type ScreenShell } from "@/lib/screens/rows";
import { BIKE_RENT_EMPTY, bikeRentDecisions, bikeRentScreenRow } from "@/lib/screens/rows/bike-rent";
import { bikeRentBandFigures, bikeRentRunning, bikeRentSummaryOf } from "@/lib/advances/list-display";
import { bikeRentListWhere, describeBikeRentFilters, readBikeRentListParams } from "@/lib/advances/list-filters";
import { describeScope, resolveViewerScope } from "@/lib/payouts/scope";
import { PERM } from "@/lib/permissions/codes";
import type { ReportColumn } from "@/lib/reports/types";

export const dynamic = "force-dynamic";

/** Every bike assignment in the viewer's scope. */
export async function GET(request: Request) {
  const gate = await exportGate(request, PERM.advance.bikeRent.view, PERM.advance.bikeRent.export);
  if (!gate.ok) return gate.response;
  const { ctx } = gate;

  const params = readBikeRentListParams(gate.params);
  const scope = await resolveViewerScope(prisma, ctx, PERM.advance.advance.viewAll);
  const today = new Date().toISOString().slice(0, 10);

  const [rents, company] = await Promise.all([
    prisma.bikeRent.findMany({
      where: bikeRentListWhere(scope, params, today),
      orderBy: [{ endDate: { sort: "asc", nulls: "first" } }, { startDate: "desc" }],
      select: {
        id: true, bikeNumber: true, rentPerWeek: true, startDate: true, endDate: true, notes: true,
        employee: { select: { name: true, employeeCode: true } },
      },
    }),
    params.company ? prisma.company.findUnique({ where: { id: params.company }, select: { name: true } }) : null,
  ]);
  const { rows, note } = capRows(rents);

  let screen: ScreenShell | undefined;
  if (gate.format === "json") {
    const { from, to } = listWindow(gate.params, rows.length);
    const can = { update: ctx.has(PERM.advance.bikeRent.update), remove: ctx.has(PERM.advance.bikeRent.delete) };
    screen = {
      rows: rows.slice(from, to).map((r) =>
        bikeRentScreenRow(
          {
            id: r.id,
            riderCode: r.employee.employeeCode,
            riderName: r.employee.name,
            bikeNumber: r.bikeNumber,
            rentPerWeek: Number(r.rentPerWeek),
            startDate: r.startDate,
            endDate: r.endDate,
            notes: r.notes,
          },
          today,
          bikeRentDecisions({ id: r.id, endDate: r.endDate }, today, can),
        ),
      ),
      band: bandOf(bikeRentBandFigures(bikeRentSummaryOf(rents, today))),
      empty: BIKE_RENT_EMPTY,
    };
  }

  const columns: ReportColumn[] = [
    { key: "bikeNumber", header: "Bike" },
    { key: "riderCode", header: "Rider ID" },
    { key: "rider", header: "Rider" },
    { key: "rentPerWeek", header: "Rent per week", align: "right", format: "money" },
    { key: "startDate", header: "From", format: "date" },
    { key: "endDate", header: "To", format: "date" },
    { key: "state", header: "State" },
    { key: "notes", header: "Notes" },
  ];

  return exportResponse({
    ctx,
    params: gate.params,
    format: gate.format,
    screen,
    title: "Bike rent",
    entity: "BikeRent",
    filters: describeBikeRentFilters(params, company?.name ?? null, describeScope(scope)),
    result: {
      columns,
      rows: rows.map((r) => ({
        id: r.id,
        bikeNumber: r.bikeNumber,
        riderCode: r.employee.employeeCode,
        rider: r.employee.name,
        rentPerWeek: Number(r.rentPerWeek),
        startDate: r.startDate,
        endDate: r.endDate,
        state: bikeRentRunning(r.endDate, today) ? "Running" : "Ended",
        notes: r.notes ?? "",
      })),
      summary: [{ label: "Bikes", value: note }],
      emptyMessage: "No bike assignments match these filters.",
    },
  });
}
