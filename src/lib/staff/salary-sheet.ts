import "server-only";

import ExcelJS from "exceljs";

import { monthRange } from "./payslip";

/**
 * The month's salary sheet — the "All Components Report" layout Nandini
 * Logistics keeps: one row per staff member with pay days, present days, the
 * earnings split, PF, ESI, total deduction and net, a grand total, and space
 * for remarks, signatures and the authorised signatory.
 */
export interface SalarySheetLine {
  code: string;
  name: string;
  payDays: number | null;
  presentDays: number | null;
  basic: number;
  hra: number;
  others: number;
  gross: number;
  pf: number;
  esi: number;
  advance: number;
  deductions: number;
  netPay: number;
}

/** "Sep/2026", as the sheet's heading writes it. */
export function sheetMonthLabel(month: string): string {
  const { from } = monthRange(month);
  return `${MONTHS[from.getUTCMonth()]}/${from.getUTCFullYear()}`;
}

// Spelled out rather than locale-formatted: en-IN writes September "Sept".
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const thin = { style: "thin" as const, color: { argb: "FF000000" } };
const box = { top: thin, left: thin, bottom: thin, right: thin };
const AMOUNT = "#,##0.00";
const DAYS = "0.0";

export async function toSalarySheet(month: string, lines: SalarySheetLine[]): Promise<Buffer> {
  const book = new ExcelJS.Workbook();
  book.creator = "Nandini Logistics";
  const ws = book.addWorksheet("All Components Report", {
    pageSetup: { orientation: "landscape", paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });

  // Advance recovery and other deductions get a column only when a slip has them.
  const otherDedn = lines.some((l) => l.advance + l.deductions > 0);
  const headers = [
    "Sl.No", "Emp. Id.", "Employee Name", "Pay Days", "Present Days", "BASIC", "HRA", "OTHERS",
    "Total Earning", "PF", "ESI", ...(otherDedn ? ["Advance / Other"] : []),
    "Total Dedn.", "Net Amount", "Remarks if any and Signature",
  ];
  const widths = [6, 11, 24, 9, 10, 12, 11, 11, 13, 11, 10, ...(otherDedn ? [13] : []), 12, 13, 30];
  ws.columns = widths.map((width) => ({ width }));
  const last = headers.length;
  const font = { name: "Times New Roman", size: 8 };

  ws.getCell(2, 1).value = "NANDINI LOGISTICS";
  ws.getCell(2, 1).font = { ...font, size: 9, bold: true };
  for (let c = 1; c <= last; c++) ws.getCell(2, c).border = { bottom: thin };

  ws.mergeCells(5, 1, 5, last);
  ws.getCell(5, 1).value = `Salary Sheet Report for the month of ${sheetMonthLabel(month)}`;
  ws.getCell(5, 1).font = { ...font, size: 9, bold: true };
  ws.getCell(5, 1).alignment = { horizontal: "center" };

  const head = ws.getRow(6);
  headers.forEach((h, i) => {
    const cell = head.getCell(i + 1);
    cell.value = h;
    cell.font = { ...font, bold: true };
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    cell.border = box;
  });
  head.height = 22;

  const totals = { payDays: 0, presentDays: 0, basic: 0, hra: 0, others: 0, gross: 0, pf: 0, esi: 0, other: 0, dedn: 0, net: 0 };
  lines.forEach((l, i) => {
    const other = l.advance + l.deductions;
    const dedn = l.pf + l.esi + other;
    totals.payDays += l.payDays ?? 0;
    totals.presentDays += l.presentDays ?? 0;
    totals.basic += l.basic; totals.hra += l.hra; totals.others += l.others; totals.gross += l.gross;
    totals.pf += l.pf; totals.esi += l.esi; totals.other += other; totals.dedn += dedn; totals.net += l.netPay;

    const blankZero = (n: number) => (n ? n : null);
    const values: Array<string | number | null> = [
      i + 1, l.code, l.name, l.payDays, l.presentDays, l.basic, blankZero(l.hra), blankZero(l.others),
      l.gross, l.pf, l.esi, ...(otherDedn ? [blankZero(other)] : []), dedn, l.netPay, null,
    ];
    const row = ws.getRow(7 + i);
    values.forEach((v, c) => {
      const cell = row.getCell(c + 1);
      cell.value = v;
      cell.font = font;
      cell.border = box;
      if (c >= 3 && c < values.length - 1) {
        cell.numFmt = c <= 4 ? DAYS : AMOUNT;
        cell.alignment = { horizontal: "right" };
      }
    });
  });

  const totalRow = ws.getRow(7 + lines.length);
  const totalValues: Array<string | number | null> = [
    "Grand Total", null, null, totals.payDays, totals.presentDays, totals.basic, totals.hra, totals.others,
    totals.gross, totals.pf, totals.esi, ...(otherDedn ? [totals.other] : []), totals.dedn, totals.net,
  ];
  totalValues.forEach((v, c) => {
    const cell = totalRow.getCell(c + 1);
    cell.value = v;
    cell.font = { name: "Times New Roman", size: 10, bold: true };
    if (c >= 3) {
      cell.numFmt = c <= 4 ? DAYS : AMOUNT;
      cell.alignment = { horizontal: "right" };
    }
  });

  const sign = ws.getCell(7 + lines.length + 4, last);
  sign.value = "Authorised Signatory";
  sign.font = { name: "Arial", size: 10, bold: true };
  sign.alignment = { horizontal: "center" };

  return Buffer.from(await book.xlsx.writeBuffer());
}
