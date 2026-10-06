import { requirePermission } from "@/lib/rbac/guard";
import { prisma } from "@/lib/db";
import { PERM } from "@/lib/permissions/codes";
import { customerListWhere, readCustomerListParams } from "@/lib/sales/customer-list";
import { PageHeader } from "@/components/ui/primitives";
import { ModuleStats } from "@/components/list/module-stats";
import { customerFigures } from "@/lib/metrics/figures";
import { CustomersScreen } from "./customers-screen";

export const metadata = { title: "Customers" };

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await requirePermission(PERM.sales.customer.view);
  const params = readCustomerListParams(await searchParams);
  const canSeeKyc = ctx.has(PERM.sales.customer.viewKyc);

  // Shared with the export, so a download holds exactly what this screen shows.
  const customers = await prisma.customer.findMany({
    where: customerListWhere(params, canSeeKyc),
    orderBy: { createdAt: "desc" },
    take: 200,
    include: {
      bookings: {
        select: {
          id: true, bookingNo: true, status: true, totalAmount: true, receivedAmount: true,
          unit: { select: { unitNumber: true } },
        },
      },
    },
  });

  // The band reads every customer in scope, not the filtered page.
  const statRows = await prisma.customer.findMany({
    where: customerListWhere({ ...params, q: "" }, canSeeKyc),
    select: { bookings: { select: { totalAmount: true, receivedAmount: true } } },
  });

  return (
    <div>
      <PageHeader
        title="Customers"
        description="Booked customers with their KYC, bookings and collection position."
      />

      <ModuleStats figures={customerFigures(statRows)} />

      <CustomersScreen
        customers={customers.map((c) => ({
          id: c.id,
          customerNo: c.customerNo,
          name: c.name,
          phone: c.phone,
          email: c.email,
          panNumber: c.panNumber,
          addressLine: c.addressLine,
          kycVerified: Boolean(c.kycVerifiedAt),
          kycVerifiedAt: c.kycVerifiedAt?.toISOString() ?? null,
          bookings: c.bookings.map((b) => ({
            id: b.id,
            bookingNo: b.bookingNo,
            status: b.status,
            unitNumber: b.unit.unitNumber,
            totalAmount: Number(b.totalAmount),
            receivedAmount: Number(b.receivedAmount),
          })),
        }))}
        can={{
          create: ctx.has(PERM.sales.customer.create),
          verifyKyc: ctx.has(PERM.sales.customer.verifyKyc),
          viewKyc: canSeeKyc,
          export: ctx.has(PERM.sales.customer.export),
        }}
      />
    </div>
  );
}
