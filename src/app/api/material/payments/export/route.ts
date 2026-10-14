import { prisma } from "@/lib/db";
import { capRows, exportGate, exportResponse } from "@/lib/exports/respond";
import {
  describeParts, paymentListWhere, rangeWords, readPaymentListParams, searchWords,
} from "@/lib/material/list-filters";
import { projectLabel } from "@/lib/material/list-options";
import { PERM } from "@/lib/permissions/codes";

export const dynamic = "force-dynamic";

/** Every vendor payment matching the screen's filters, within the caller's project scope. */
export async function GET(request: Request) {
  const gate = await exportGate(request, PERM.material.vendorPayment.view, PERM.material.vendorPayment.export);
  if (!gate.ok) return gate.response;
  const { ctx } = gate;
  const params = readPaymentListParams(gate.params);

  const payments = await prisma.vendorPayment.findMany({
    where: paymentListWhere(ctx, params),
    orderBy: { paymentDate: "desc" },
    include: {
      invoice: {
        select: {
          invoiceNo: true,
          vendor: { select: { name: true } },
          purchaseOrder: { select: { poNo: true, project: { select: { code: true } } } },
        },
      },
    },
  });
  const { rows, note } = capRows(payments);

  const filters = describeParts(
    [
      searchWords(params.q),
      params.mode ? `Mode ${params.mode}` : null,
      await projectLabel(params.project),
      rangeWords("Paid", params),
    ],
    "All vendor payments in view",
  );

  return exportResponse({
    ctx,
    format: gate.format,
    title: "Vendor Payments",
    entity: "VendorPayment",
    filters,
    result: {
      columns: [
        { key: "paymentNo", header: "Payment No" },
        { key: "invoiceNo", header: "Invoice No" },
        { key: "poNo", header: "PO No" },
        { key: "project", header: "Project" },
        { key: "vendor", header: "Vendor" },
        { key: "paymentDate", header: "Paid on", format: "date" },
        { key: "mode", header: "Mode" },
        { key: "referenceNo", header: "Reference" },
        { key: "amount", header: "Amount", align: "right", format: "money" },
      ],
      rows: rows.map((p) => ({
        id: p.id,
        paymentNo: p.paymentNo,
        invoiceNo: p.invoice.invoiceNo,
        poNo: p.invoice.purchaseOrder.poNo,
        project: p.invoice.purchaseOrder.project.code,
        vendor: p.invoice.vendor.name,
        paymentDate: p.paymentDate,
        mode: p.mode,
        referenceNo: p.referenceNo ?? "",
        amount: Number(p.amount),
      })),
      summary: [
        { label: "Payments", value: note },
      ],
      emptyMessage: "No vendor payments match these filters.",
    },
  });
}
