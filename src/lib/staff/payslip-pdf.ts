import "server-only";

import PDFDocument from "pdfkit";

import { CONTENT_W, DEFAULT_ISSUER, MARGIN, PAGE, PDF, drawFooter, drawLetterhead, loadLogo, type Issuer } from "@/lib/pdf/brand";
import { monthLabel, monthRange, rupeesInWords } from "./payslip";

/**
 * The payslip as a one-page PDF — the SOW's "manual payslip generation per
 * staff (PDF)". Built from the stored figures, so the file says exactly what
 * the record says. Laid out like an invoice: letterhead, the slip's number
 * and period, the employee's particulars, earnings beside deductions, and a
 * net-pay band with the amount in words.
 */
export interface PayslipPdfInput {
  employeeCode: string;
  name: string;
  designation: string | null;
  /** Optional particulars; a blank one is shown as "—". */
  joinedOn?: Date | null;
  pan?: string | null;
  pfNumber?: string | null;
  insuranceNumber?: string | null;
  bankName?: string | null;
  bankAccountNo?: string | null;
  bankIfsc?: string | null;
  month: string;
  payDays: number | null;
  payableDays: number | null;
  basic: number;
  hra: number;
  others: number;
  gross: number;
  pf: number;
  esi: number;
  advance: number;
  deductions: number;
  netPay: number;
  notes: string | null;
  generatedBy: string;
  generatedAt: Date;
  issuer?: Issuer | null;
}

const rupees = (v: number) => `Rs. ${v.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const shortDate = (d: Date) => d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });
const dash = (v: string | null | undefined) => (v && v.trim() ? v : "—");

/** The last four digits only — a payslip travels further than a bank form. */
export function maskAccount(no: string | null | undefined): string {
  if (!no || !no.trim()) return "—";
  const digits = no.replace(/\s/g, "");
  return digits.length <= 4 ? digits : `${"X".repeat(Math.min(digits.length - 4, 8))}${digits.slice(-4)}`;
}

export async function toPayslipPdf(input: PayslipPdfInput): Promise<Buffer> {
  const issuer = input.issuer ?? DEFAULT_ISSUER;
  const mark = await loadLogo();
  const period = monthRange(input.month);
  const lastDay = new Date(period.to.getTime() - 86_400_000);
  const slipNo = `NL/PS/${input.month.replace("-", "")}/${input.employeeCode}`;

  const doc = new PDFDocument({
    size: "A4",
    margins: { top: 130, bottom: 84, left: MARGIN, right: MARGIN },
    info: { Title: `Payslip ${input.employeeCode} ${input.month}`, Author: issuer.name, Subject: `Salary slip · ${monthLabel(input.month)}`, CreationDate: input.generatedAt },
  });
  const chunks: Buffer[] = [];
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });

  let y = drawLetterhead(doc, issuer, mark);

  /* ------------------------------------------------------- title and period */
  doc.font("Helvetica-Bold").fontSize(20).fillColor(PDF.NAVY).text("SALARY SLIP", MARGIN, y, { lineBreak: false });
  doc.font("Helvetica").fontSize(10).fillColor(PDF.MUTED).text(`For the month of ${monthLabel(input.month)}`, MARGIN, y + 25, { lineBreak: false });

  // The slip's own particulars, boxed on the right like an invoice number block.
  const metaW = 220;
  const metaX = PAGE.w - MARGIN - metaW;
  const meta: Array<[string, string]> = [
    ["Slip no.", slipNo],
    ["Pay period", `${shortDate(period.from)} – ${shortDate(lastDay)}`],
    ["Issued on", shortDate(input.generatedAt)],
  ];
  const metaH = 12 + meta.length * 15;
  doc.save().roundedRect(metaX, y - 4, metaW, metaH, 5).fill(PDF.TINT).restore();
  meta.forEach(([k, v], i) => {
    const ly = y + 4 + i * 15;
    doc.font("Helvetica").fontSize(8.5).fillColor(PDF.MUTED).text(k, metaX + 10, ly, { width: 70, lineBreak: false });
    doc.font("Helvetica-Bold").fontSize(8.5).fillColor(PDF.INK).text(v, metaX + 80, ly, { width: metaW - 90, align: "right", lineBreak: false });
  });
  y += Math.max(44, metaH) + 14;

  /* ---------------------------------------------------- employee particulars */
  const gap = 16;
  const colW = (CONTENT_W - gap) / 2;
  const leftCol: Array<[string, string]> = [
    ["Employee name", input.name],
    ["Employee ID", input.employeeCode],
    ["Designation", dash(input.designation)],
    ["Date of joining", input.joinedOn ? shortDate(input.joinedOn) : "—"],
    ["PAN", dash(input.pan)],
  ];
  const rightCol: Array<[string, string]> = [
    ["PF / UAN no.", dash(input.pfNumber)],
    ["ESI no.", dash(input.insuranceNumber)],
    ["Bank", dash(input.bankName)],
    ["Account no.", maskAccount(input.bankAccountNo)],
    ["IFSC", dash(input.bankIfsc)],
  ];
  const panel = (x: number, title: string, rows: Array<[string, string]>) => {
    const h = 26 + rows.length * 16 + 8;
    doc.save().roundedRect(x, y, colW, h, 6).lineWidth(0.8).strokeColor(PDF.LINE).stroke().restore();
    doc.save().rect(x, y, colW, 22).fill(PDF.TINT).restore();
    doc.font("Helvetica-Bold").fontSize(8.5).fillColor(PDF.NAVY).text(title.toUpperCase(), x + 12, y + 7, { characterSpacing: 0.6, lineBreak: false });
    rows.forEach(([k, v], i) => {
      const ry = y + 30 + i * 16;
      const labelW = 86;
      doc.font("Helvetica").fontSize(9).fillColor(PDF.MUTED).text(k, x + 12, ry, { width: labelW, lineBreak: false });
      // A long identifier (a PF number runs to 22 characters) is set smaller rather than wrapped.
      doc.font("Helvetica-Bold").fontSize(v.length > 18 ? 7.5 : 9).fillColor(PDF.INK)
        .text(v, x + 12 + labelW, ry + (v.length > 18 ? 1 : 0), { width: colW - labelW - 24, align: "right", lineBreak: false, ellipsis: true });
    });
    return h;
  };
  const h1 = panel(MARGIN, "Employee details", leftCol);
  const h2 = panel(MARGIN + colW + gap, "Statutory & bank details", rightCol);
  y += Math.max(h1, h2) + 14;

  /* ------------------------------------------------------------ attendance */
  const lop = input.payDays !== null && input.payableDays !== null ? Math.max(0, input.payDays - input.payableDays) : null;
  const tiles: Array<[string, string]> = [
    ["Pay days", input.payDays === null ? "—" : String(input.payDays)],
    ["Present days", input.payableDays === null ? "—" : String(input.payableDays)],
    ["Loss of pay", lop === null ? "—" : String(lop)],
    ["Payment mode", input.bankAccountNo ? "Bank transfer" : "—"],
  ];
  const tileW = (CONTENT_W - 3 * 10) / 4;
  tiles.forEach(([k, v], i) => {
    const x = MARGIN + i * (tileW + 10);
    doc.save().roundedRect(x, y, tileW, 40, 5).fill(PDF.TINT).restore();
    doc.font("Helvetica").fontSize(7.5).fillColor(PDF.MUTED).text(k.toUpperCase(), x + 10, y + 8, { characterSpacing: 0.5, lineBreak: false });
    doc.font("Helvetica-Bold").fontSize(12).fillColor(PDF.NAVY).text(v, x + 10, y + 20, { lineBreak: false });
  });
  y += 40 + 16;

  /* ------------------------------------------ earnings beside deductions */
  const earnings: Array<[string, number]> = [
    ["Basic salary", input.basic],
    ["House rent allowance", input.hra],
    ["Other allowances", input.others],
  ];
  const ded: Array<[string, number]> = [
    ["Provident fund (PF)", input.pf],
    ["ESI", input.esi],
    ["Advance recovery", input.advance],
    ["Other deductions", input.deductions],
  ];
  const totalDed = input.pf + input.esi + input.advance + input.deductions;
  const rowH = 20;
  const rows = Math.max(earnings.length, ded.length);

  const table = (x: number, title: string, lines: Array<[string, number]>, totalLabel: string, total: number) => {
    doc.save().rect(x, y, colW, 22).fill(PDF.NAVY).restore();
    doc.font("Helvetica-Bold").fontSize(9).fillColor(PDF.WHITE);
    doc.text(title, x + 10, y + 7, { width: colW * 0.6, lineBreak: false });
    doc.text("Amount (Rs.)", x + colW * 0.6, y + 7, { width: colW * 0.4 - 10, align: "right", lineBreak: false });
    for (let i = 0; i < rows; i++) {
      const ry = y + 22 + i * rowH;
      if (i % 2 === 1) doc.save().rect(x, ry, colW, rowH).fill(PDF.TINT).restore();
      const line = lines[i];
      if (!line) continue;
      doc.font("Helvetica").fontSize(9.5).fillColor(PDF.INK);
      doc.text(line[0], x + 10, ry + 6, { width: colW * 0.6, lineBreak: false });
      doc.text(line[1].toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }), x + colW * 0.6, ry + 6, { width: colW * 0.4 - 10, align: "right", lineBreak: false });
    }
    const ty = y + 22 + rows * rowH;
    doc.save().moveTo(x, ty).lineTo(x + colW, ty).lineWidth(0.8).strokeColor(PDF.NAVY).stroke().restore();
    doc.font("Helvetica-Bold").fontSize(9.5).fillColor(PDF.NAVY);
    doc.text(totalLabel, x + 10, ty + 7, { width: colW * 0.6, lineBreak: false });
    doc.text(total.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }), x + colW * 0.6, ty + 7, { width: colW * 0.4 - 10, align: "right", lineBreak: false });
    doc.save().rect(x, y, colW, ty + 24 - y).lineWidth(0.8).strokeColor(PDF.LINE).stroke().restore();
    return ty + 24 - y;
  };
  const th = table(MARGIN, "Earnings", earnings, "Total earnings", input.gross);
  table(MARGIN + colW + gap, "Deductions", ded, "Total deductions", totalDed);
  y += th + 16;

  /* -------------------------------------------------------------- net pay */
  const bandH = 54;
  doc.save().roundedRect(MARGIN, y, CONTENT_W, bandH, 6).fill(PDF.NAVY).restore();
  doc.save().rect(MARGIN, y + 8, 3, bandH - 16).fill(PDF.BRAND).restore();
  doc.font("Helvetica").fontSize(8).fillColor("#C9CEE6").text("NET PAY", MARGIN + 16, y + 11, { characterSpacing: 0.8, lineBreak: false });
  doc.font("Helvetica").fontSize(9).fillColor("#E6E9F5").text(rupeesInWords(input.netPay), MARGIN + 16, y + 27, { width: CONTENT_W - 200, lineBreak: false });
  doc.font("Helvetica-Bold").fontSize(18).fillColor(PDF.WHITE).text(rupees(input.netPay), MARGIN + CONTENT_W - 196, y + 17, { width: 180, align: "right", lineBreak: false });
  y += bandH + 14;

  /* ----------------------------------------------------------------- notes */
  if (input.notes) {
    doc.font("Helvetica-Bold").fontSize(8.5).fillColor(PDF.NAVY).text("Notes", MARGIN, y, { lineBreak: false });
    doc.font("Helvetica").fontSize(9).fillColor(PDF.INK).text(input.notes, MARGIN, y + 13, { width: CONTENT_W });
    y = doc.y + 10;
  }

  /* ------------------------------------------------------------ signature */
  const sigY = Math.max(y + 24, PAGE.h - 170);
  const half = CONTENT_W / 2 - 16;
  const sx = MARGIN + CONTENT_W - half;
  doc.font("Helvetica").fontSize(9.5).fillColor(PDF.MUTED).text(`For ${issuer.name}`, sx, sigY, { width: half, align: "right" });
  const lineY = sigY + 44;
  doc.save().moveTo(sx, lineY).lineTo(sx + half, lineY).lineWidth(0.8).strokeColor(PDF.LINE).stroke().restore();
  doc.font("Helvetica-Bold").fontSize(9.5).fillColor(PDF.INK).text("Authorised Signatory", sx, lineY + 6, { width: half, align: "right" });
  doc.font("Helvetica").fontSize(8.5).fillColor(PDF.MUTED).text(`Prepared by ${input.generatedBy}`, sx, lineY + 19, { width: half, align: "right" });

  drawFooter(
    doc,
    `${issuer.name} · Salary slip · ${slipNo}`,
    `${input.employeeCode} · ${monthLabel(input.month)}`,
    "This is a system-generated payslip from the Nandini Rider CRM and does not require a signature or seal.",
  );

  doc.end();
  return done;
}
