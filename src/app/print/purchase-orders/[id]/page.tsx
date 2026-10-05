import { notFound } from "next/navigation";

import { requirePermission } from "@/lib/rbac/guard";
import { prisma } from "@/lib/db";
import { PERM } from "@/lib/permissions/codes";
import { formatDateTime, formatDayMonth, money, moneyShort, qty } from "@/lib/utils";
import { requirePrintProjectAccess } from "@/components/print/access";
import { place } from "@/components/print/figures";
import { PrintBanner, SectionLabel } from "@/components/print/blocks";
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
          name: true, addressLine: true,
          city: { select: { name: true, state: { select: { name: true } } } },
          projectManager: { select: { name: true, phone: true, email: true } },
          company: { select: LETTERHEAD_COMPANY_SELECT },
        },
      },
      vendor: {
        select: {
          name: true, contactPerson: true, phone: true, email: true,
          addressLine: true, pincode: true, gstin: true,
          city: { select: { name: true, state: { select: { name: true } } } },
        },
      },
      paymentTerm: { select: { name: true, days: true } },
      createdBy: { select: { name: true } },
      pmApprovedBy: { select: { name: true } },
      adminApprovedBy: { select: { name: true } },
      sourceIndent: { select: { indentNo: true } },
      items: {
        include: { item: { select: { code: true, name: true, uom: { select: { name: true } } } } },
      },
    },
  });
  if (!po) notFound();

  requirePrintProjectAccess(ctx, po.projectId);

  const showRate = ctx.has(PERM.material.purchaseOrder.viewRate);
  const company = po.project.company;
  const statusLabel = po.status.replace(/_/g, " ").toLowerCase().replace(/^./, (c) => c.toUpperCase());
  const subTotal = Number(po.subTotal);

  // Contact lines, from the vendor and project masters. Each is left out
  // entirely when the master holds nothing, rather than printing a dash.
  const vendorAddress = place([
    po.vendor.addressLine, po.vendor.city?.name, po.vendor.city?.state.name, po.vendor.pincode,
  ]);
  const vendorContact = [
    po.vendor.contactPerson,
    po.vendor.phone && `☏ ${po.vendor.phone}`,
    po.vendor.email,
  ].filter(Boolean).join(" · ");
  const siteAddress = place([
    po.project.addressLine, po.project.city?.name, po.project.city?.state.name,
  ]);
  const pm = po.project.projectManager;
  const siteContact = pm
    ? [`Project Manager ${pm.name}`, pm.phone && `☏ ${pm.phone}`, pm.email].filter(Boolean).join(" · ")
    : "";
  const taxPct = subTotal > 0 ? Math.round((Number(po.taxAmount) / subTotal) * 100) : 0;

  return (
    <PrintSheet backHref={`/material/purchase-orders/${po.id}`} backLabel={po.poNo} printLabel="Print purchase order">
      <Letterhead
        company={company}
        title="PURCHASE ORDER"
        reference={po.poNo}
        note={`${po.revision > 0 ? `Revision ${po.revision}` : "Original"} · ${statusLabel}`}
      />

      {po.status === "CANCELLED" && <PrintBanner tone="bad">Cancelled</PrintBanner>}

      {/*
        Who it is for and where it goes — both with somebody to ring.

        A printed order that names a vendor and no way to reach them is a sheet
        of paper the store has to look someone up for. Everything here comes off
        the vendor and project masters, so correcting a number in one place
        corrects every order printed afterwards.
      */}
      <section className="print-keep grid grid-cols-2 gap-6 py-[18px]">
        <div>
          <SectionLabel>Vendor</SectionLabel>
          <p className="mt-[5px] text-[14px] font-bold">{po.vendor.name}</p>
          {vendorAddress && <p className="mt-1 text-[11.5px] text-muted-600">{vendorAddress}</p>}
          {vendorContact && <p className="mt-0.5 text-[11.5px] text-muted-600">{vendorContact}</p>}
          {po.vendor.gstin && (
            <p className="mt-0.5 text-[11.5px] text-muted-600">GSTIN {po.vendor.gstin}</p>
          )}
          <p className="mt-1 text-[11.5px] text-muted-600">
            {po.sourceIndent ? `Against indent: ${po.sourceIndent.indentNo}` : "Raised directly"}
          </p>
        </div>
        <div>
          <SectionLabel>Deliver to</SectionLabel>
          <p className="mt-[5px] text-[14px] font-bold">{po.project.name} · site store</p>
          {siteAddress && <p className="mt-1 text-[11.5px] text-muted-600">{siteAddress}</p>}
          {siteContact && <p className="mt-0.5 text-[11.5px] text-muted-600">{siteContact}</p>}
          <p className="mt-1 text-[11.5px] text-muted-600">
            {[
              po.expectedDate ? `Due ${formatDayMonth(po.expectedDate)}` : null,
              po.paymentTerm?.name,
              po.terms,
            ].filter(Boolean).join(" · ") || "—"}
          </p>
        </div>
      </section>

      {/* What was ordered */}
      <table className="[&_td]:!border-0 [&_td]:!border-b [&_td]:!border-line-300 [&_th]:!border-0 [&_th]:!border-b-[1.5px] [&_th]:!border-navy-900 [&_thead_th]:!bg-transparent">
        <thead>
          <tr>
            <th className="w-10 text-left">Sl</th>
            <th className="text-left">Item</th>
            <th className="text-right">Qty</th>
            {showRate && <th className="text-right">Rate</th>}
            {showRate && <th className="text-right">Amount</th>}
          </tr>
        </thead>
        <tbody>
          {po.items.map((l, i) => (
            <tr key={l.id}>
              <td className="num text-[11.5px] font-semibold text-muted-500">{i + 1}</td>
              <td>
                <p className="text-[12.5px] font-semibold">{l.item.name}</p>
                <p className="mt-0.5 text-[10.5px] text-muted-400">{l.item.code}</p>
              </td>
              <td className="num text-right text-[12px] font-semibold">
                {qty(l.orderedQty, 3)} {l.item.uom.name}
              </td>
              {showRate && <td className="num text-right text-[12px] font-semibold">{money(l.rate)}</td>}
              {showRate && <td className="num text-right text-[12.5px] font-bold">{moneyShort(Number(l.amount))}</td>}
            </tr>
          ))}
        </tbody>
      </table>

      {showRate && (
        <div className="print-keep mt-3.5 flex justify-end">
          <div className="min-w-[250px]">
            <div className="flex justify-between py-1.5 text-[12px] font-semibold text-muted-600">
              <span>Subtotal</span><span className="num">{moneyShort(Number(po.subTotal))}</span>
            </div>
            <div className="flex justify-between border-b border-line-300 py-1.5 text-[12px] font-semibold text-muted-600">
              <span>GST {taxPct}%</span><span className="num">{moneyShort(Number(po.taxAmount))}</span>
            </div>
            <div className="flex justify-between py-2.5 font-display text-[15px] font-extrabold">
              <span>Total</span><span className="num">{moneyShort(Number(po.totalAmount))}</span>
            </div>
          </div>
        </div>
      )}

      {po.deliveryAddress && (
        <section className="print-keep mt-[18px] rounded-[8px] border border-line-300 bg-surface-tint px-3.5 py-3">
          <SectionLabel>Remarks</SectionLabel>
          <p className="mt-1 whitespace-pre-line text-[11.5px]">{po.deliveryAddress}</p>
        </section>
      )}

      {/* Who raised it and who approved it */}
      <section className="print-keep mt-[34px] grid grid-cols-3 gap-[18px] border-t border-line-300 pt-[18px]">
        {[
          { label: "Raised by", name: po.createdBy.name, at: formatDateTime(po.poDate) },
          {
            label: "Approved · Project Manager",
            name: po.pmApprovedBy?.name ?? "Pending",
            at: po.pmApprovedAt ? formatDateTime(po.pmApprovedAt) : "—",
          },
          {
            label: "Approved · Admin",
            name: po.adminApprovedBy?.name ?? "Pending",
            at: po.adminApprovedAt ?? po.approvedAt ? formatDateTime(po.adminApprovedAt ?? po.approvedAt) : "—",
          },
        ].map((b) => (
          <div key={b.label}>
            <SectionLabel>{b.label}</SectionLabel>
            <p className="mt-[22px] text-[12px] font-semibold">{b.name}</p>
            <p className="mt-0.5 text-[10.5px] text-muted-400">{b.at}</p>
          </div>
        ))}
      </section>

      <p className="mt-5 text-[10.5px] text-muted-300">
        This purchase order is valid only with both approvals recorded above. Any revision supersedes
        all earlier versions of {po.poNo}.
      </p>
    </PrintSheet>
  );
}
