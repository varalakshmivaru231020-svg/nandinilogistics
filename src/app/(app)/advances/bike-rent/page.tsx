import { requirePermission } from "@/lib/rbac/guard";
import { prisma } from "@/lib/db";
import { PERM } from "@/lib/permissions/codes";
import { bikeRentListWhere, readBikeRentListParams } from "@/lib/advances/list-filters";
import { bikeRentSummaryOf } from "@/lib/advances/list-display";
import { describeScope, employeeScopeWhere, resolveViewerScope } from "@/lib/payouts/scope";
import { BikeRentScreen } from "./bike-rent-screen";

export const metadata = { title: "Bike rent" };

/** Bikes assigned to riders at a weekly rent — SOW §3.5. */
export default async function BikeRentPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await requirePermission(PERM.advance.bikeRent.view);
  const params = readBikeRentListParams(await searchParams);
  const scope = await resolveViewerScope(prisma, ctx, PERM.advance.advance.viewAll);
  const today = new Date().toISOString().slice(0, 10);

  const [rents, companies, riders] = await Promise.all([
    prisma.bikeRent.findMany({
      where: bikeRentListWhere(scope, params, today),
      orderBy: [{ endDate: { sort: "asc", nulls: "first" } }, { startDate: "desc" }],
      select: {
        id: true, bikeNumber: true, rentPerWeek: true, startDate: true, endDate: true, notes: true,
        employee: { select: { id: true, name: true, employeeCode: true } },
      },
    }),
    prisma.company.findMany({ where: { status: "ACTIVE" }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    ctx.hasAny(PERM.advance.bikeRent.create, PERM.advance.bikeRent.update)
      ? prisma.employee.findMany({
          where: { onboardingStatus: "ACCEPTED", status: "ACTIVE", ...employeeScopeWhere(scope) },
          orderBy: { name: "asc" },
          select: { id: true, name: true, employeeCode: true },
        })
      : Promise.resolve([]),
  ]);

  return (
    <BikeRentScreen
      rents={rents.map((r) => ({
        id: r.id,
        riderId: r.employee.id,
        riderCode: r.employee.employeeCode,
        riderName: r.employee.name,
        bikeNumber: r.bikeNumber,
        rentPerWeek: Number(r.rentPerWeek),
        startDate: r.startDate.toISOString().slice(0, 10),
        endDate: r.endDate ? r.endDate.toISOString().slice(0, 10) : null,
        notes: r.notes,
      }))}
      summary={bikeRentSummaryOf(rents, today)}
      today={today}
      companies={companies}
      riders={riders.map((r) => ({ id: r.id, label: `${r.employeeCode} — ${r.name}` }))}
      picked={{ state: params.state, company: params.company }}
      q={params.q}
      scopeWords={describeScope(scope)}
      can={{
        create: ctx.has(PERM.advance.bikeRent.create),
        update: ctx.has(PERM.advance.bikeRent.update),
        delete: ctx.has(PERM.advance.bikeRent.delete),
        export: ctx.has(PERM.advance.bikeRent.export),
      }}
    />
  );
}
