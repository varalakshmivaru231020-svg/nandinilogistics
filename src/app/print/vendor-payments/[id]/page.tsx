import { notFound } from "next/navigation";

import { requirePermission } from "@/lib/rbac/guard";
import { prisma } from "@/lib/db";
import { PERM } from "@/lib/permissions/codes";
import { formatDate, money } from "@/lib/utils";
import { requirePrintProjectAccess } from "@/components/print/access";
import { AmountInWords, FactList, PrintBanner, PrintBox, SectionLabel, SignatureBlocks } from "@/components/print/blocks";
import { invoiceSettlement, place } from "@/components/print/figures";
import { LETTERHEAD_COMPANY_SELECT, Letterhead } from "@/components/print/letterhead";
import { PrintSheet } from "@/components/print/print-sheet";

/**
 * The vendor payment voucher. Scoped through the invoice's purchase order, as
 * the payments list is. The vendor's bank account prints only for users who
 * can see it in the vendor master (`masters.vendor.view`) — the payments
 * screen itself never shows it.
 */

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const p = await prisma.vendorPayment.findUnique({ where: { id }, select: { paymentNo: true } });
  return { title: p ? `Print ${p.paymentNo}` : "Payment Voucher" };
}

export default async function PrintVendorPaymentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requirePermission(PERM.material.vendorPayment.view, PERM.material.vendorPayment.print);

  const payment = await prisma.vendorPayment.findUnique({
    where: { id },
    include: {
      invoice: {
        select: {
          id: true, invoiceNo: true, invoiceDate: true, subTotal: true, taxAmount: true, totalAmount: true, status: true,
          vendor: {
            select: {
              code: true, name: true, addressLine: true, pincode: true, gstin: true, pan: true,
              bankName: true, accountNumber: true, ifsc: true,
              city: { select: { name: true, state: { select: { name: true } } } },
            },
          },
          purchaseOrder: {
            select: {
              poNo: true, projectId: true,
              project: { select: { code: true, name: true, company: { select: LETTERHEAD_COMPANY_SELECT } } },
            },
          },
          payments: { select: { id: true, paymentNo: true, paymentDate: true, createdAt: true, amount: true } },
        },
      },
    },
  });
  if (!payment) notFound();

  const { invoice } = payment;
  requirePrintProjectAccess(ctx, invoice.purchaseOrder.projectId);

  const showBank = ctx.has(PERM.masters.vendor.view);
  const vendor = invoice.vendor;
  const company = invoice.purchaseOrder.project.company;
  const settlement = invoiceSettlement(
    Number(invoice.totalAmount),
    invoice.payments.map((p) => ({ id: p.id, paymentDate: p.paymentDate, createdAt: p.createdAt, amount: Number(p.amount) })),
    payment.id,
  );
  const vendorAddress = place([vendor.addressLine, vendor.city?.name, vendor.city?.state.name, vendor.pincode]);

  return (
    <PrintSheet backHref="/material/payments" backLabel="Vendor payments" printLabel="Print voucher">
      <Letterhead
        company={company}
        title="PAYMENT VOUCHER"
        facts={[
          { label: "Voucher No.", value: payment.paymentNo, emphasis: "bold" },
          { label: "Date", value: formatDate(payment.paymentDate) },
          { label: "Mode", value: payment.mode, emphasis: "semibold" },
        ]}
      />

      {invoice.status === "CANCELLED" && <PrintBanner tone="bad">The invoice this payment settles is cancelled</PrintBanner>}

      <section className="print-keep mt-4 grid grid-cols-2 gap-4">
        <PrintBox label="Paid to">
          <p className="mt-1 text-[13px] font-bold">{vendor.name}</p>
          <p className="text-[10.5px] text-muted-600">Code {vendor.code}</p>
          {vendorAddress && <p className="mt-1">{vendorAddress}</p>}
          <FactList
            rows={[
              ["GSTIN", vendor.gstin ?? "—"],
              ["PAN", vendor.pan ?? "—"],
              showBank && ["Bank", vendor.bankName ?? "—"],
              showBank && ["Account No.", vendor.accountNumber ?? "—"],
              showBank && ["IFSC", vendor.ifsc ?? "—"],
            ]}
          />
        </PrintBox>

        <PrintBox label="Payment">
          <p className="num mt-1 text-[17px] font-extrabold">{money(payment.amount, true)}</p>
          <FactList
            rows={[
              ["Mode", payment.mode],
              ["Reference", payment.referenceNo ?? "—"],
              ["Project", `${invoice.purchaseOrder.project.code} — ${invoice.purchaseOrder.project.name}`],
              ["Purchase order", invoice.purchaseOrder.poNo],
            ]}
          />
        </PrintBox>
      </section>

      <section className="print-keep mt-4">
        <SectionLabel>Invoice settled</SectionLabel>
        <table className="mt-1">
          <thead>
            <tr>
              <th className="text-left">Invoice No.</th>
              <th className="text-left">Invoice date</th>
              <th className="text-right">Invoice total</th>
              <th className="text-right">Paid before</th>
              <th className="text-right">This payment</th>
              <th className="text-right">Balance after</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="font-semibold">{invoice.invoiceNo}</td>
              <td>{formatDate(invoice.invoiceDate)}</td>
              <td className="num text-right">{money(settlement.invoiceTotal, true)}</td>
              <td className="num text-right">{money(settlement.paidBefore, true)}</td>
              <td className="num text-right font-bold">{money(settlement.thisPayment, true)}</td>
              <td className="num text-right">{money(settlement.balanceAfter, true)}</td>
            </tr>
          </tbody>
        </table>
        <p className="mt-1 text-[10.5px] text-muted-600">
          Invoice sub-total {money(invoice.subTotal, true)} + GST {money(invoice.taxAmount, true)}.
        </p>
      </section>

      <AmountInWords amount={Number(payment.amount)} className="print-keep mt-3" />

      {payment.remarks && (
        <section className="print-keep mt-4">
          <SectionLabel>Remarks</SectionLabel>
          <p className="mt-1 whitespace-pre-line">{payment.remarks}</p>
        </section>
      )}

      <SignatureBlocks
        blocks={[
          { role: "Prepared by" },
          { role: "Checked by" },
          { role: `For ${company?.name ?? "the company"}`, name: "Authorised signatory" },
          { role: "Received by", name: vendor.name },
        ]}
      />
    </PrintSheet>
  );
}
