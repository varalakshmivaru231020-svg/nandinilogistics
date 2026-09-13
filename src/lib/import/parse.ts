import ExcelJS from "exceljs";
import Papa from "papaparse";

/**
 * Reading an uploaded spreadsheet — CSV or Excel — into plain rows of text.
 *
 * Deliberately knows nothing about leads or masters: it turns bytes into
 * headers and rows. Validation belongs to the thing being imported, so an
 * imported row passes exactly the checks the create form applies.
 *
 * Server-side only in practice (it pulls in exceljs); the dependency-free
 * column helpers live in ./columns.ts and are re-exported here.
 */

export * from "./columns";
import { normaliseHeader } from "./columns";

export const IMPORT_MAX_ROWS = 2000;
export const IMPORT_MAX_BYTES = 4 * 1024 * 1024;

export interface ParsedSheet {
  headers: string[];
  /** Keyed by header exactly as written in the file. */
  rows: Array<Record<string, string>>;
}

/** A problem with the file itself, as opposed to a row in it. Safe to show the user. */
export class ImportFileError extends Error {}

/**
 * Our own exports prefix text that looks like a formula with an apostrophe, so
 * a spreadsheet will not run it. Re-importing an export should give back the
 * original value, so exactly that prefix is removed — and nothing else.
 */
function unneutralise(value: string): string {
  return /^'[=+\-@]/.test(value) ? value.slice(1) : value;
}

function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function finish(headers: string[], body: string[][]): ParsedSheet {
  const cleanHeaders = headers.map((h) => h.trim());
  if (cleanHeaders.every((h) => !h)) {
    throw new ImportFileError("The first row must name the columns.");
  }

  const seen = new Set<string>();
  for (const h of cleanHeaders) {
    if (!h) continue;
    const key = normaliseHeader(h);
    if (seen.has(key)) throw new ImportFileError(`The column "${h}" appears twice.`);
    seen.add(key);
  }

  const rows = body
    .filter((cells) => cells.some((c) => c.trim() !== ""))
    .map((cells) => {
      const row: Record<string, string> = {};
      cleanHeaders.forEach((h, i) => {
        if (h) row[h] = unneutralise((cells[i] ?? "").trim());
      });
      return row;
    });

  if (rows.length === 0) throw new ImportFileError("The file has headers but no rows.");
  if (rows.length > IMPORT_MAX_ROWS) {
    throw new ImportFileError(
      `The file has ${rows.length.toLocaleString("en-IN")} rows; import at most ${IMPORT_MAX_ROWS.toLocaleString("en-IN")} at a time.`,
    );
  }
  return { headers: cleanHeaders.filter(Boolean), rows };
}

function parseCsv(bytes: ArrayBuffer): ParsedSheet {
  const text = new TextDecoder("utf-8").decode(bytes).replace(/^﻿/, "");
  const result = Papa.parse<string[]>(text, { header: false, skipEmptyLines: "greedy" });
  const fatal = result.errors.find((e) => e.type === "Quotes");
  if (fatal) throw new ImportFileError(`Row ${(fatal.row ?? 0) + 1}: ${fatal.message}.`);
  const [headers = [], ...body] = result.data;
  return finish(headers, body);
}

function cellText(cell: ExcelJS.Cell): string {
  const v = cell.value;
  if (v === null || v === undefined) return "";
  if (v instanceof Date) return isoDay(v);
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (typeof v === "object" && "result" in v) {
    const r = (v as ExcelJS.CellFormulaValue).result;
    if (r instanceof Date) return isoDay(r);
    return r === null || r === undefined ? "" : String(r);
  }
  return cell.text ?? "";
}

async function parseXlsx(bytes: ArrayBuffer): Promise<ParsedSheet> {
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(bytes);
  } catch {
    throw new ImportFileError("This does not look like an Excel (.xlsx) file.");
  }
  const ws = wb.worksheets[0];
  if (!ws) throw new ImportFileError("The workbook has no sheets.");

  const width = ws.columnCount;
  const lines: string[][] = [];
  ws.eachRow({ includeEmpty: false }, (row) => {
    const cells: string[] = [];
    for (let c = 1; c <= width; c++) cells.push(cellText(row.getCell(c)));
    lines.push(cells);
  });
  const [headers = [], ...body] = lines;
  return finish(headers, body);
}

/** Reads an upload by its extension. Old binary .xls is refused by name. */
export async function parseUpload(fileName: string, bytes: ArrayBuffer): Promise<ParsedSheet> {
  if (bytes.byteLength === 0) throw new ImportFileError("The file is empty.");
  if (bytes.byteLength > IMPORT_MAX_BYTES) {
    throw new ImportFileError("The file is larger than 4 MB. Split it and import in parts.");
  }
  const name = fileName.toLowerCase();
  if (name.endsWith(".csv") || name.endsWith(".txt")) return parseCsv(bytes);
  if (name.endsWith(".xlsx")) return parseXlsx(bytes);
  if (name.endsWith(".xls")) {
    throw new ImportFileError("Save the file as .xlsx (Excel Workbook) or .csv — the old .xls format is not supported.");
  }
  throw new ImportFileError("Upload a .csv or .xlsx file.");
}

/** Reads the `file` field of an upload form. */
export async function parseUploadFrom(formData: FormData): Promise<ParsedSheet> {
  const file = formData.get("file");
  if (!file || typeof file === "string") throw new ImportFileError("Choose a file to import.");
  return parseUpload(file.name, await file.arrayBuffer());
}
