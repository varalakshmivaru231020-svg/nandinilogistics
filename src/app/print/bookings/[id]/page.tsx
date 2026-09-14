import { notFound } from "next/navigation";

import { requirePermission } from "@/lib/rbac/guard";
import { prisma } from "@/lib/db";
import { PERM } from "@/lib/permissions/codes";
import { formatDate, money, qty } from "@/lib/utils";
import { requirePrintProjectAccess } from "@/components/print/access";
import { AmountInWords, FactList, PrintBanner, PrintBox, SectionLabel, SignatureBlocks } from "@/components/print/blocks";
import { demandFigures, scheduleTotals } from "@/components/print/figures";
import { LETTERHEAD_COMPANY_SELECT, Letterhead } from "@/components/print/letterhead";
import { PrintSheet } from "@/components/print/print-sheet";

/**
 * The booking / allotment form. Customer phone, address and PAN print only
 * with `sales.customer.viewKyc` — the booking and customer screens mask them
 * without it — and Aadhaar, which no screen shows, never prints. The payment
 * schedule follows the booking's Payment schedule tab permission.
 */

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const b = await prisma.booking.findUnique({ where: { id }, select: { bookingNo: true } });
  return { title: b ? `Print ${b.bookingNo}` : "Booking Form" };
}

export default async function PrintBookingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requirePermission(PERM.sales.booking.view, PERM.sales.booking.print);

  const booking = await prisma.booking.findUnique({
    where: { id },
    include: {
      project: {
        select: { code: true, name: true, reraNumber: true, company: { select: LETTERHEAD_COMPANY_SELECT } },
      },
      unit: {
        select: {
          unitNumber: true, floorNumber: true, carpetArea: true, builtUpArea: true, superBuiltUpArea: true,
          facing: true, parkingSlots: true, plcTag: true,
          block: { select: { code: true, name: true } },
          unitType: { select: { name: true } },
        },
      },
      customer: {
        select: {
          name: true, customerNo: true, phone: true, email: true, addressLine: true, panNumber: true, kycVerifiedAt: true,
        },
      },
      soldBy: { select: { name: true } },
      costSheet: {
        select: {
          costSheetNo: true, baseRate: true, subTotal: true, discountAmount: true, taxAmount: true, totalAmount: true,
        },
      },
      demands: { orderBy: { sortOrder: "asc" } },
    },
  });
  if (!booking) notFound();

  requirePrintProjectAccess(ctx, booking.projectId);

  const viewKyc = ctx.has(PERM.sales.customer.viewKyc);
  const showSchedule = ctx.has(PERM.sales.booking.tabDemands);
  const company = booking.project.company;
  const { unit, customer, costSheet } = booking;

  const demands = booking.demands.map((d) => ({
    id: d.id,
    demandNo: d.demandNo,
    milestone: d.milestone,
    dueDate: d.dueDate,
    ...demandFigures({
      amount: Number(d.amount),
      taxAmount: Number(d.taxAmount),
      totalAmount: Number(d.totalAmount),
      receivedAmount: Number(d.receivedAmount),
    }),
  }));
  const totals = scheduleTotals(
    booking.demands.map((d) => ({
      amount: Number(d.amount), taxAmount: Number(d.taxAmount),
      totalAmount: Number(d.totalAmount), receivedAmount: Number(d.receivedAmount),
    })),
  );

  return (
    <PrintSheet backHref={`/sales/bookings/${booking.id}`} backLabel={booking.bookingNo} printLabel="Print booking form">
      <Letterhead
        company={company}
        title="BOOKING FORM"
        facts={[
          { label: "Booking No.", value: booking.bookingNo, emphasis: "bold" },
          { label: "Date", value: formatDate(booking.bookingDate) },
          { label: "Status", value: booking.status, emphasis: "semibold" },
        ]}
      />

      {booking.status === "CANCELLED" && (
        <PrintBanner tone="bad">Cancelled{booking.remarks ? ` — ${booking.remarks}` : ""}</PrintBanner>
      )}
      {booking.status === "DRAFT" && <PrintBanner tone="warn">Draft — not a confirmed allotment</PrintBanner>}

      <section className="print-keep mt-4 grid grid-cols-2 gap-4">
        <PrintBox label="Applicant">
          <p className="mt-1 text-[13px] font-bold">{customer.name}</p>
          <p className="text-[10.5px] text-muted-600">Customer {customer.customerNo}</p>
          <FactList
            rows={[
              ["Phone", viewKyc ? customer.phone : "••••••"],
              ["Email", customer.email ?? "—"],
              viewKyc && ["Address", customer.addressLine ?? "—"],
              viewKyc && ["PAN", customer.panNumber ?? "—"],
              ["KYC", customer.kycVerifiedAt ? `Verified ${formatDate(customer.kycVerifiedAt)}` : "Pending"],
            ]}
          />
        </PrintBox>

        <PrintBox label="Unit allotted">
          <p className="mt-1 text-[13px] font-bold">
            Unit {unit.unitNumber}{unit.block ? ` · ${unit.block.name}` : ""}
          </p>
          <p className="text-[10.5px] text-muted-600">{booking.project.code} — {booking.project.name}</p>
          <FactList
            rows={[
              ["Type", unit.unitType?.name ?? "—"],
              ["Floor", String(unit.floorNumber)],
              ["Super built-up", `${qty(unit.superBuiltUpArea, 2)} sq.ft`],
              ["Built-up", `${qty(unit.builtUpArea, 2)} sq.ft`],
              ["Carpet", `${qty(unit.carpetArea, 2)} sq.ft`],
              unit.facing ? ["Facing", unit.facing] : false,
              ["Parking", String(unit.parkingSlots)],
              unit.plcTag ? ["PLC", unit.plcTag.replace(/_/g, " ")] : false,
              booking.project.reraNumber ? ["RERA", booking.project.reraNumber] : false,
            ]}
          />
        </PrintBox>
      </section>

      <section className="print-keep mt-4">
        <SectionLabel>Consideration</SectionLabel>
        <div className="mt-1 flex items-start justify-between gap-6">
          <div className="max-w-[55%] space-y-1 pt-1">
            <AmountInWords amount={Number(booking.totalAmount)} />
            <p className="text-[10.5px] text-muted-600">
              {costSheet ? `As per cost sheet ${costSheet.costSheetNo}.` : "No cost sheet is linked to this booking."}
              {booking.soldBy && ` Sold by ${booking.soldBy.name}.`}
            </p>
          </div>
          <table className="!w-72 [&_td]:!py-1">
            <tbody>
              {costSheet && (
                <>
                  <tr><td className="text-muted-600">Base rate</td><td className="num text-right">{money(costSheet.baseRate, true)} / sq.ft</td></tr>
                  <tr><td className="text-muted-600">Sub-total</td><td className="num text-right">{money(costSheet.subTotal, true)}</td></tr>
                  <tr><td className="text-muted-600">GST</td><td className="num text-right">{money(costSheet.taxAmount, true)}</td></tr>
                  {Number(costSheet.discountAmount) > 0 && (
                    <tr><td className="text-muted-600">Discount</td><td className="num text-right">−{money(costSheet.discountAmount, true)}</td></tr>
                  )}
                </>
              )}
              <tr className="font-bold">
                <td>Total consideration</td><td className="num text-right text-[13px]">{money(booking.totalAmount, true)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {showSchedule && demands.length > 0 && (
        <section className="mt-4">
          <SectionLabel>Payment schedule</SectionLabel>
          <table className="mt-1">
            <thead>
              <tr>
                <th className="w-8 text-right">#</th>
                <th className="text-left">Milestone</th>
                <th className="text-left">Due date</th>
                <th className="text-right">Amount</th>
                <th className="text-right">GST</th>
                <th className="text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {demands.map((d, i) => (
                <tr key={d.id}>
                  <td className="num text-right">{i + 1}</td>
                  <td>
                    <p>{d.milestone}</p>
                    <p className="text-[10px] text-muted-600">{d.demandNo}</p>
                  </td>
                  <td>{formatDate(d.dueDate)}</td>
                  <td className="num text-right">{money(d.amount, true)}</td>
                  <td className="num text-right">{money(d.tax, true)}</td>
                  <td className="num text-right">{money(d.total, true)}</td>
                </tr>
              ))}
              <tr className="font-bold">
                <td colSpan={3} className="text-right">Total</td>
                <td className="num text-right">{money(totals.amount, true)}</td>
                <td className="num text-right">{money(totals.tax, true)}</td>
                <td className="num text-right">{money(totals.total, true)}</td>
              </tr>
            </tbody>
          </table>
        </section>
      )}

      <section className="print-keep mt-4 text-[10.5px]">
        <SectionLabel>Declaration</SectionLabel>
        <p className="mt-1">
          I/We confirm the particulars above and agree to pay the consideration as per the payment schedule. The
          allotment is subject to the terms of the agreement for sale, which will prevail over this form.
        </p>
      </section>

      <SignatureBlocks
        blocks={[
          { role: "Applicant", name: customer.name },
          { role: "Sales executive", name: booking.soldBy?.name ?? "" },
          { role: `For ${company?.name ?? "the company"}`, name: "Authorised signatory" },
        ]}
      />
    </PrintSheet>
  );
}
