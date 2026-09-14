import { notFound } from "next/navigation";

import { requirePermission } from "@/lib/rbac/guard";
import { prisma } from "@/lib/db";
import { PERM } from "@/lib/permissions/codes";
import { formatDate, money, qty } from "@/lib/utils";
import { requirePrintProjectAccess } from "@/components/print/access";
import { AmountInWords, FactList, PrintBanner, PrintBox, SectionLabel, SignatureBlocks } from "@/components/print/blocks";
import { place } from "@/components/print/figures";
import { LETTERHEAD_COMPANY_SELECT, Letterhead } from "@/components/print/letterhead";
import { PrintSheet } from "@/components/print/print-sheet";

/**
 * The printable purchase order. The sheet, letterhead and signature blocks are
 * shared with every other printed document — see src/components/print.
 */

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const po = await prisma.purchaseOrder.findUnique({ where: { id }, select: { poNo: true } });
  return { title: po ? `Print ${po.poNo}` : "Purchase Order" };
}

export default async function PrintPurchaseOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requirePermission(PERM.material.purchaseOrder.view, PERM.material.purchaseOrder.print);

  const po = await prisma.purchaseOrder.findUnique({
    where: { id },
    include: {
      project: {
        select: {
          code: true, name: true, addressLine: true, reraNumber: true,
          city: { select: { name: true, state: { select: { name: true } } } },
          company: { select: LETTERHEAD_COMPANY_SELECT },
        },
      },
      vendor: {
        select: {
          code: true, name: true, contactPerson: true, phone: true, email: true, addressLine: true,
          pincode: true, gstin: true, pan: true,
          city: { select: { name: true, state: { select: { name: true } } } },
        },
      },
      paymentTerm: { select: { name: true, days: true } },
      createdBy: { select: { name: true } },
      pmApprovedBy: { select: { name: true } },
      adminApprovedBy: { select: { name: true } },
      items: {
        include: { item: { select: { code: true, name: true, hsnCode: true, uom: { select: { code: true } } } } },
      },
    },
  });
  if (!po) notFound();

  requirePrintProjectAccess(ctx, po.projectId);

  const showRate = ctx.has(PERM.material.purchaseOrder.viewRate);
  const company = po.project.company;
  const approved = po.adminApprovedAt !== null || po.approvedAt !== null;
  const anyDiscount = po.items.some((l) => Number(l.discountPct) > 0);
  const statusLabel = po.status.replace(/_/g, " ");

  const projectAddress = place([
    po.project.addressLine, po.project.city?.name, po.project.city?.state.name,
  ]);
  const vendorAddress = place([po.vendor.addressLine, po.vendor.city?.name, po.vendor.city?.state.name, po.vendor.pincode]);

  return (
    <PrintSheet backHref={`/material/purchase-orders/${po.id}`} backLabel={po.poNo} printLabel="Print purchase order">
      <Letterhead
        company={company}
        title="PURCHASE ORDER"
        facts={[
          { label: "PO No.", value: po.poNo, emphasis: "bold" },
          { label: "Date", value: formatDate(po.poDate) },
          { label: "Revision", value: po.revision },
          { label: "Status", value: statusLabel, emphasis: "semibold" },
        ]}
      />

      {!approved && (
        <PrintBanner tone="warn">
          Not approved — {statusLabel.toLowerCase()}. Not valid as an order until fully approved.
        </PrintBanner>
      )}
      {po.status === "CANCELLED" && <PrintBanner tone="bad">Cancelled</PrintBanner>}

      {/* Parties */}
      <section className="print-keep mt-4 grid grid-cols-2 gap-4">
        <PrintBox label="Vendor">
          <p className="mt-1 text-[13px] font-bold">{po.vendor.name}</p>
          <p className="text-[10.5px] text-muted-600">Code {po.vendor.code}</p>
          {vendorAddress && <p className="mt-1">{vendorAddress}</p>}
          <FactList
            rows={[
              ["GSTIN", po.vendor.gstin ?? "—"],
              ["PAN", po.vendor.pan ?? "—"],
              ["Contact", [po.vendor.contactPerson, po.vendor.phone, po.vendor.email].filter(Boolean).join(" · ") || "—"],
            ]}
          />
        </PrintBox>

        <PrintBox label="Deliver to">
          <p className="mt-1 text-[13px] font-bold">{po.project.code} — {po.project.name}</p>
          <p className="mt-1 whitespace-pre-line">{po.deliveryAddress || projectAddress || "—"}</p>
          <FactList
            rows={[
              ["Expected by", formatDate(po.expectedDate)],
              ["Payment term", po.paymentTerm ? `${po.paymentTerm.name}${po.paymentTerm.days ? ` (${po.paymentTerm.days} days)` : ""}` : "—"],
              po.project.reraNumber ? ["RERA", po.project.reraNumber] : false,
            ]}
          />
        </PrintBox>
      </section>

      {/* Items */}
      <section className="mt-4">
        <table>
          <thead>
            <tr>
              <th className="w-8 text-right">#</th>
              <th className="text-left">Item</th>
              <th className="text-left">UOM</th>
              <th className="text-right">Qty</th>
              {showRate && <th className="text-right">Rate</th>}
              {showRate && anyDiscount && <th className="text-right">Disc %</th>}
              {showRate && <th className="text-right">GST %</th>}
              {showRate && <th className="text-right">Amount</th>}
            </tr>
          </thead>
          <tbody>
            {po.items.map((l, i) => (
              <tr key={l.id}>
                <td className="num text-right">{i + 1}</td>
                <td>
                  <p className="font-semibold">{l.item.name}</p>
                  <p className="text-[10px] text-muted-600">
                    {l.item.code}
                    {l.item.hsnCode && ` · HSN ${l.item.hsnCode}`}
                    {l.specification && ` · ${l.specification}`}
                  </p>
                </td>
                <td>{l.item.uom.code}</td>
                <td className="num text-right">{qty(l.orderedQty, 3)}</td>
                {showRate && <td className="num text-right">{money(l.rate, true)}</td>}
                {showRate && anyDiscount && <td className="num text-right">{Number(l.discountPct)}%</td>}
                {showRate && <td className="num text-right">{Number(l.taxPct)}%</td>}
                {showRate && <td className="num text-right">{money(l.amount, true)}</td>}
              </tr>
            ))}
          </tbody>
        </table>

        {showRate && (
          <div className="print-keep mt-2 flex items-start justify-between gap-6">
            <AmountInWords amount={Number(po.totalAmount)} className="max-w-[60%] pt-1" />
            <table className="!w-64 [&_td]:!py-1">
              <tbody>
                <tr><td className="text-muted-600">Sub-total</td><td className="num text-right">{money(po.subTotal, true)}</td></tr>
                <tr><td className="text-muted-600">GST</td><td className="num text-right">{money(po.taxAmount, true)}</td></tr>
                <tr><td className="text-muted-600">Other charges</td><td className="num text-right">{money(po.otherCharges, true)}</td></tr>
                <tr className="font-bold">
                  <td>Grand total</td><td className="num text-right text-[13px]">{money(po.totalAmount, true)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </section>

      {po.terms && (
        <section className="print-keep mt-4">
          <SectionLabel>Terms &amp; conditions</SectionLabel>
          <p className="mt-1 whitespace-pre-line">{po.terms}</p>
        </section>
      )}

      {/* Approval trail */}
      <section className="print-keep mt-4">
        <SectionLabel>Approval trail</SectionLabel>
        <table className="mt-1">
          <tbody>
            <tr>
              <td className="w-40 text-muted-600">Raised by</td>
              <td>{po.createdBy.name}</td>
              <td className="w-32">{formatDate(po.poDate)}</td>
            </tr>
            <tr>
              <td className="text-muted-600">Project Manager</td>
              <td>{po.pmApprovedBy?.name ?? "Pending"}</td>
              <td>{formatDate(po.pmApprovedAt)}</td>
            </tr>
            <tr>
              <td className="text-muted-600">Owner / Admin</td>
              <td>{po.adminApprovedBy?.name ?? "Pending"}</td>
              <td>{formatDate(po.adminApprovedAt ?? po.approvedAt)}</td>
            </tr>
          </tbody>
        </table>
      </section>

      <SignatureBlocks
        blocks={[
          { role: "Prepared by", name: po.createdBy.name },
          { role: "Approved by", name: po.adminApprovedBy?.name ?? po.pmApprovedBy?.name ?? "" },
          { role: `For ${company?.name ?? "the company"}`, name: "Authorised signatory" },
        ]}
      />

      <section className="print-keep mt-8 border-t border-line-400 pt-3 text-[10.5px]">
        <p className="font-semibold">Vendor acceptance</p>
        <p className="text-muted-600">
          We accept this purchase order and its terms. Please quote the PO number on every challan and invoice.
        </p>
        <div className="mt-8 grid grid-cols-2 gap-6">
          <div><div className="border-b border-navy-950" /><p className="mt-1 text-muted-600">Signature &amp; seal</p></div>
          <div><div className="border-b border-navy-950" /><p className="mt-1 text-muted-600">Date</p></div>
        </div>
      </section>
    </PrintSheet>
  );
}
