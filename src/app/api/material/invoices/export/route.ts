import { prisma } from "@/lib/db";
import { capRows, exportGate, exportResponse } from "@/lib/exports/respond";
import {
  describeParts, enumWords, invoiceListWhere, rangeWords, readInvoiceListParams, searchWords,
} from "@/lib/material/list-filters";
import { projectLabel } from "@/lib/material/list-options";
import { PERM } from "@/lib/permissions/codes";

export const dynamic = "force-dynamic";

/** Every vendor invoice matching the screen's filters, within the caller's project scope. */
export async function GET(request: Request) {
  const gate = await exportGate(request, PERM.material.vendorInvoice.view, PERM.material.vendorInvoice.export);
  if (!gate.ok) return gate.response;
  const { ctx } = gate;
  const params = readInvoiceListParams(gate.params);

  const invoices = await prisma.vendorInvoice.findMany({
    where: invoiceListWhere(ctx, params),
    orderBy: { invoiceDate: "desc" },
    include: {
      vendor: { select: { name: true } },
      purchaseOrder: { select: { poNo: true, project: { select: { code: true } } } },
    },
  });
  const { rows, note } = capRows(invoices);

  const filters = describeParts(
    [
      searchWords(params.q),
      enumWords("Status", params.status),
      await projectLabel(params.project),
      rangeWords("Invoice date", params),
    ],
    "All vendor invoices in view",
  );

  return exportResponse({
    ctx,
    format: gate.format,
    title: "Vendor Invoices",
    entity: "VendorInvoice",
    filters,
    result: {
      columns: [
        { key: "invoiceNo", header: "Invoice No" },
        { key: "poNo", header: "PO No" },
        { key: "project", header: "Project" },
        { key: "vendor", header: "Vendor" },
        { key: "invoiceDate", header: "Invoice date", format: "date" },
        { key: "amount", header: "Amount", align: "right", format: "money" },
        { key: "paid", header: "Paid", align: "right", format: "money" },
        { key: "outstanding", header: "Outstanding", align: "right", format: "money" },
        { key: "status", header: "Status" },
      ],
      rows: rows.map((i) => {
        const amount = Number(i.totalAmount);
        const paid = Number(i.paidAmount);
        return {
          invoiceNo: i.invoiceNo,
          poNo: i.purchaseOrder.poNo,
          project: i.purchaseOrder.project.code,
          vendor: i.vendor.name,
          invoiceDate: i.invoiceDate,
          amount,
          paid,
          outstanding: Math.max(0, amount - paid),
          status: i.status.replace(/_/g, " "),
        };
      }),
      summary: [{ label: "Invoices", value: note }],
      emptyMessage: "No vendor invoices match these filters.",
    },
  });
}
