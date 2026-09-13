import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";

import {
  cellText, exportFileName, isExportFormat, toCsv, toPdf, toXlsx,
  type ExportMeta,
} from "@/lib/reports/export";
import type { ReportResult } from "@/lib/reports/types";

/** exceljs types load() against the pre-generic Buffer; hand it the underlying bytes instead. */
const asArrayBuffer = (b: Buffer) => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;

const meta: ExportMeta = {
  title: "Booking register",
  filters: "NN Skyline · 1 Apr 2026 – 30 Jun 2026",
  generatedBy: "Test Runner",
  generatedAt: new Date("2026-09-13T10:00:00Z"),
};

const result = (rows: Array<Record<string, unknown>>): ReportResult => ({
  columns: [
    { key: "customer", header: "Customer" },
    { key: "value", header: "Value", align: "right", format: "money" },
    { key: "share", header: "Collected", align: "right", format: "percent" },
    { key: "booked", header: "Booked on", format: "date" },
    { key: "change", header: "Change", align: "right", format: "number" },
  ],
  rows,
  summary: [{ label: "Bookings", value: String(rows.length) }],
  emptyMessage: "No bookings in this range.",
});

const sample = result([
  { customer: "Anita Sharma", value: 8640000, share: 45, booked: "2026-05-02T00:00:00Z", change: -1200 },
  { customer: 'Rao "RK" Kumar', value: 7250000, share: 100, booked: "2026-06-11T00:00:00Z", change: 300 },
]);

describe("export formats", () => {
  it("recognises the three formats and nothing else", () => {
    expect(["csv", "xlsx", "pdf"].every(isExportFormat)).toBe(true);
    expect(isExportFormat("docx")).toBe(false);
    expect(isExportFormat(undefined)).toBe(false);
  });

  it("names the file after the report and the day", () => {
    expect(exportFileName("Booking register", "xlsx", meta.generatedAt)).toBe("booking-register-2026-09-13.xlsx");
    expect(exportFileName("Stock & valuation!", "csv", meta.generatedAt)).toBe("stock-valuation-2026-09-13.csv");
  });

  it("formats a cell the way the screen does", () => {
    expect(cellText(45, "percent")).toBe("45%");
    expect(cellText(null, "money")).toBe("");
    expect(cellText(8640000, "money")).toMatch(/86/);
  });
});

describe("CSV", () => {
  it("starts with a byte-order mark so Excel reads it as UTF-8", () => {
    expect(toCsv(sample).charCodeAt(0)).toBe(0xfeff);
  });

  it("writes the headers, then a line per row", () => {
    const lines = toCsv(sample).slice(1).split("\r\n");
    expect(lines[0]).toBe('"Customer","Value","Collected","Booked on","Change"');
    expect(lines).toHaveLength(3);
  });

  it("escapes quotes inside a cell", () => {
    expect(toCsv(sample)).toContain('"Rao ""RK"" Kumar"');
  });

  it("neutralises a formula typed into a text field", () => {
    const hostile = result([{ customer: '=HYPERLINK("http://evil","click")', value: 1, share: 1, booked: null, change: 0 }]);
    expect(toCsv(hostile)).toContain(`"'=HYPERLINK`);
  });

  it("leaves a negative number in a numeric column alone", () => {
    expect(toCsv(sample)).not.toContain(`"'-`);
  });
});

describe("Excel", () => {
  async function load(buffer: Buffer) {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(asArrayBuffer(buffer));
    return wb.worksheets[0];
  }

  it("produces a workbook that opens, with the report's headers", async () => {
    const ws = await load(await toXlsx(sample, meta));
    const headerRow = ws.getRows(1, ws.rowCount)!.find((r) => r.getCell(1).value === "Customer");
    expect(headerRow).toBeDefined();
    expect(headerRow!.getCell(2).value).toBe("Value");
  });

  it("stores money as a number, so it can be summed", async () => {
    const ws = await load(await toXlsx(sample, meta));
    const anita = ws.getRows(1, ws.rowCount)!.find((r) => r.getCell(1).value === "Anita Sharma")!;
    expect(typeof anita.getCell(2).value).toBe("number");
    expect(anita.getCell(2).value).toBe(8640000);
  });

  it("keeps the sheet name within Excel's rules", async () => {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(asArrayBuffer(await toXlsx(sample, { ...meta, title: "Consumption vs indent vs budget: [all projects]" })));
    const name = wb.worksheets[0].name;
    expect(name.length).toBeLessThanOrEqual(31);
    expect(name).not.toMatch(/[[\]:*?/\\]/);
  });
});

describe("PDF", () => {
  it("produces a PDF", async () => {
    const pdf = await toPdf(sample, meta);
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
  });

  it("still produces one when there is nothing to report", async () => {
    const pdf = await toPdf(result([]), meta);
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
  });

  it("carries a long report onto further pages", async () => {
    const many = result(
      Array.from({ length: 150 }, (_, i) => ({
        customer: `Customer ${i}`, value: 1000 + i, share: i % 100, booked: "2026-05-02T00:00:00Z", change: i,
      })),
    );
    const pdf = (await toPdf(many, meta)).toString("latin1");
    const pages = pdf.match(/\/Type \/Page[^s]/g) ?? [];
    expect(pages.length).toBeGreaterThan(1);
  });
});
