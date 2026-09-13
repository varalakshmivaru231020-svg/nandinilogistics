import "server-only";

import ExcelJS from "exceljs";
import PDFDocument from "pdfkit";

import { formatDate, money, qty } from "@/lib/utils";

import type { ReportColumn, ReportResult } from "./types";

/**
 * Report exports — CSV, Excel and PDF — built from exactly the result the
 * screen shows, so an export can never say something the report did not.
 */

export type ExportFormat = "csv" | "xlsx" | "pdf";
export const EXPORT_FORMATS: readonly ExportFormat[] = ["csv", "xlsx", "pdf"];

export const EXPORT_MIME: Record<ExportFormat, string> = {
  csv: "text/csv; charset=utf-8",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  pdf: "application/pdf",
};

export function isExportFormat(value: unknown): value is ExportFormat {
  return typeof value === "string" && (EXPORT_FORMATS as readonly string[]).includes(value);
}

export interface ExportMeta {
  title: string;
  /** What the rows were narrowed to, in words — "NN Skyline · 1 Apr 2026 – 30 Jun 2026". */
  filters: string;
  generatedBy: string;
  generatedAt: Date;
}

const NUMERIC = new Set(["money", "number", "qty", "percent"]);

export function exportFileName(title: string, format: ExportFormat, at: Date): string {
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "report";
  return `${slug}-${at.toISOString().slice(0, 10)}.${format}`;
}

/** A cell as text, formatted the way the screen formats it. */
export function cellText(value: unknown, format?: ReportColumn["format"]): string {
  if (value === null || value === undefined || value === "") return "";
  switch (format) {
    case "money": return money(value as number);
    case "qty": return qty(value as number, 3);
    case "number": return Number(value).toLocaleString("en-IN");
    case "percent": return `${Number(value)}%`;
    case "date": return formatDate(value as string);
    default: return String(value);
  }
}

/**
 * Text that a spreadsheet would run as a formula. Lead names, notes and vendor
 * names are typed by people, and a cell beginning "=HYPERLINK(...)" becomes live
 * the moment the export is opened. Only text columns are guarded; a negative
 * number in a numeric column is a number, not an attack.
 */
function neutralise(text: string, format?: ReportColumn["format"]): string {
  if (format && NUMERIC.has(format)) return text;
  return /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
}

/* ----------------------------------- CSV ---------------------------------- */

export function toCsv(result: ReportResult): string {
  const quote = (cell: string) => `"${cell.replace(/"/g, '""')}"`;
  const header = result.columns.map((c) => quote(c.header)).join(",");
  const lines = result.rows.map((row) =>
    result.columns.map((c) => quote(neutralise(cellText(row[c.key], c.format), c.format))).join(","),
  );
  // The byte-order mark is what makes Excel read the file as UTF-8, so a rupee
  // sign or a name in Kannada arrives intact instead of as mojibake.
  return "﻿" + [header, ...lines].join("\r\n");
}

/* ---------------------------------- Excel --------------------------------- */

/** Excel forbids these in sheet names and caps them at 31 characters. */
function sheetName(title: string): string {
  return title.replace(/[[\]:*?/\\]/g, " ").slice(0, 31).trim() || "Report";
}

/**
 * Numbers go in as numbers, not as the formatted text on screen, so the people
 * who open the file can sum, sort and pivot it. The display format is set on
 * the cell instead.
 */
export async function toXlsx(result: ReportResult, meta: ExportMeta): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = meta.generatedBy;
  wb.created = meta.generatedAt;

  const ws = wb.addWorksheet(sheetName(meta.title));

  ws.addRow([meta.title]).font = { bold: true, size: 14 };
  ws.addRow([meta.filters]).font = { color: { argb: "FF7A80A3" } };
  ws.addRow([`Generated ${formatDate(meta.generatedAt.toISOString())} by ${meta.generatedBy}`]).font = {
    color: { argb: "FF7A80A3" },
  };
  for (const s of result.summary ?? []) {
    ws.addRow([s.label, s.value]).getCell(1).font = { bold: true };
  }
  ws.addRow([]);

  const headerRow = ws.addRow(result.columns.map((c) => c.header));
  headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
  headerRow.eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF191A5C" } };
  });
  const headerIndex = headerRow.number;

  for (const row of result.rows) {
    const values = result.columns.map((c) => {
      const v = row[c.key];
      if (v === null || v === undefined || v === "") return null;
      if (c.format === "date") return new Date(v as string);
      if (c.format && NUMERIC.has(c.format)) return Number(v);
      return String(v);
    });
    ws.addRow(values);
  }

  result.columns.forEach((c, i) => {
    const col = ws.getColumn(i + 1);
    if (c.format === "money") col.numFmt = '"₹"#,##0.00';
    else if (c.format === "qty") col.numFmt = "#,##0.000";
    else if (c.format === "number") col.numFmt = "#,##0";
    else if (c.format === "percent") col.numFmt = '0"%"';
    else if (c.format === "date") col.numFmt = "dd mmm yyyy";
    if (c.align === "right" || (c.format && NUMERIC.has(c.format))) col.alignment = { horizontal: "right" };

    const longest = Math.max(
      c.header.length,
      ...result.rows.slice(0, 500).map((r) => cellText(r[c.key], c.format).length),
    );
    col.width = Math.min(48, Math.max(10, longest + 2));
  });

  ws.views = [{ state: "frozen", ySplit: headerIndex }];

  return Buffer.from(await wb.xlsx.writeBuffer());
}

/* ----------------------------------- PDF ---------------------------------- */

/**
 * The built-in PDF fonts are Latin-1: they cannot draw a rupee sign. "Rs." is
 * how the symbol is written wherever the glyph is unavailable, rather than
 * leaving a blank where the currency should be.
 */
function pdfSafe(text: string): string {
  return text.replace(/₹\s?/g, "Rs. ");
}

export async function toPdf(result: ReportResult, meta: ExportMeta): Promise<Buffer> {
  const landscape = result.columns.length > 6;
  const doc = new PDFDocument({
    size: "A4",
    layout: landscape ? "landscape" : "portrait",
    margin: 36,
    bufferPages: true,
    info: { Title: meta.title, Author: meta.generatedBy, CreationDate: meta.generatedAt },
  });

  const chunks: Buffer[] = [];
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });

  const left = doc.page.margins.left;
  const width = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const bottom = doc.page.height - doc.page.margins.bottom - 18;

  doc.font("Helvetica-Bold").fontSize(15).fillColor("#191A5C").text(pdfSafe(meta.title), left, 36);
  doc.font("Helvetica").fontSize(8.5).fillColor("#7A80A3")
    .text(pdfSafe(meta.filters))
    .text(`Generated ${formatDate(meta.generatedAt.toISOString())} by ${meta.generatedBy}`);

  if (result.summary?.length) {
    doc.moveDown(0.4).fillColor("#22264A");
    for (const s of result.summary) {
      doc.font("Helvetica-Bold").text(`${pdfSafe(s.label)}: `, { continued: true })
        .font("Helvetica").text(pdfSafe(s.value));
    }
  }
  doc.moveDown(0.8);

  // Column widths in proportion to what they hold, with a floor so a short
  // header still gets room.
  const weights = result.columns.map((c) =>
    Math.max(
      6,
      c.header.length,
      ...result.rows.slice(0, 200).map((r) => Math.min(40, cellText(r[c.key], c.format).length)),
    ),
  );
  const total = weights.reduce((a, b) => a + b, 0);
  const widths = weights.map((w) => (w / total) * width);
  const ROW = 15;
  const PAD = 3;

  const fit = (text: string, w: number) => {
    let t = pdfSafe(text);
    if (doc.widthOfString(t) <= w - PAD * 2) return t;
    while (t.length > 1 && doc.widthOfString(`${t}…`) > w - PAD * 2) t = t.slice(0, -1);
    return `${t}…`;
  };

  const drawHeader = (y: number) => {
    doc.rect(left, y, width, ROW).fill("#191A5C");
    doc.font("Helvetica-Bold").fontSize(8).fillColor("#FFFFFF");
    let x = left;
    result.columns.forEach((c, i) => {
      const numeric = c.align === "right" || (c.format !== undefined && NUMERIC.has(c.format));
      doc.text(fit(c.header, widths[i]), x + PAD, y + 4, {
        width: widths[i] - PAD * 2, align: numeric ? "right" : "left", lineBreak: false,
      });
      x += widths[i];
    });
    return y + ROW;
  };

  let y = drawHeader(doc.y);

  if (result.rows.length === 0) {
    doc.font("Helvetica").fontSize(9).fillColor("#7A80A3")
      .text(result.emptyMessage ?? "Nothing to report.", left, y + 8);
  }

  result.rows.forEach((row, index) => {
    if (y + ROW > bottom) {
      doc.addPage();
      y = drawHeader(doc.page.margins.top);
    }
    if (index % 2 === 1) doc.rect(left, y, width, ROW).fill("#F4F6FB");
    doc.font("Helvetica").fontSize(8).fillColor("#22264A");
    let x = left;
    result.columns.forEach((c, i) => {
      const numeric = c.align === "right" || (c.format !== undefined && NUMERIC.has(c.format));
      doc.text(fit(cellText(row[c.key], c.format), widths[i]), x + PAD, y + 4, {
        width: widths[i] - PAD * 2, align: numeric ? "right" : "left", lineBreak: false,
      });
      x += widths[i];
    });
    y += ROW;
  });

  // Page numbers, now that the total is known.
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    doc.font("Helvetica").fontSize(7.5).fillColor("#9BA1C2").text(
      `${meta.title} · page ${i - range.start + 1} of ${range.count}`,
      left,
      doc.page.height - doc.page.margins.bottom - 8,
      { width, align: "right", lineBreak: false },
    );
  }

  doc.end();
  return done;
}
