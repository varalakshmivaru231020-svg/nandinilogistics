import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";

import {
  dayText, IMPORT_MAX_ROWS, ImportFileError, matchColumns, normaliseHeader, numberText,
  parseUpload, templateCsv, truthy, valueOf,
} from "@/lib/import/parse";

const bytes = (text: string) => new TextEncoder().encode(text).buffer as ArrayBuffer;

async function xlsx(rows: unknown[][]): Promise<ArrayBuffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Sheet1");
  for (const r of rows) ws.addRow(r);
  const buf = await wb.xlsx.writeBuffer();
  return buf as ArrayBuffer;
}

describe("parseUpload — CSV", () => {
  it("reads headers and rows, handling a byte-order mark and quoted commas", async () => {
    const sheet = await parseUpload("leads.csv", bytes('﻿Name,Phone,Requirement\r\n"Rao, K",9876543210,"2 BHK, east"\r\n'));
    expect(sheet.headers).toEqual(["Name", "Phone", "Requirement"]);
    expect(sheet.rows).toEqual([{ Name: "Rao, K", Phone: "9876543210", Requirement: "2 BHK, east" }]);
  });

  it("skips blank lines, including ones that are only commas", async () => {
    const sheet = await parseUpload("x.csv", bytes("Name,Phone\n\nA,1\n,\nB,2\n"));
    expect(sheet.rows.map((r) => r.Name)).toEqual(["A", "B"]);
  });

  it("gives back what our own export neutralised", async () => {
    const sheet = await parseUpload("x.csv", bytes(`Name,Note\n"'=SUM(A1)","'hello"\n`));
    expect(sheet.rows[0]).toEqual({ Name: "=SUM(A1)", Note: "'hello" });
  });

  it("refuses a file with headers and no rows", async () => {
    await expect(parseUpload("x.csv", bytes("Name,Phone\n"))).rejects.toThrow(/no rows/);
  });

  it("refuses a column named twice, however it is written", async () => {
    await expect(parseUpload("x.csv", bytes("Lead Source,lead_source\na,b\n"))).rejects.toThrow(/appears twice/);
  });

  it("refuses more rows than an import allows", async () => {
    const body = Array.from({ length: IMPORT_MAX_ROWS + 1 }, (_, i) => `n${i},${i}`).join("\n");
    await expect(parseUpload("x.csv", bytes(`Name,Phone\n${body}\n`))).rejects.toThrow(/at most/);
  });
});

describe("parseUpload — Excel", () => {
  it("reads the first sheet, with dates as yyyy-mm-dd and numbers as text", async () => {
    const file = await xlsx([
      ["Code", "Name", "Rate", "Since"],
      ["CEM", "Cement", 412.5, new Date(Date.UTC(2026, 3, 5))],
    ]);
    const sheet = await parseUpload("items.xlsx", file);
    expect(sheet.rows).toEqual([{ Code: "CEM", Name: "Cement", Rate: "412.5", Since: "2026-04-05" }]);
  });

  it("says so when an .xlsx is not really one", async () => {
    await expect(parseUpload("fake.xlsx", bytes("not a zip"))).rejects.toThrow(/does not look like an Excel/);
  });
});

describe("parseUpload — anything else", () => {
  it("refuses the old .xls format by name, and unknown types", async () => {
    await expect(parseUpload("old.xls", bytes("x"))).rejects.toThrow(/\.xlsx/);
    await expect(parseUpload("notes.pdf", bytes("x"))).rejects.toBeInstanceOf(ImportFileError);
  });

  it("refuses an empty file", async () => {
    await expect(parseUpload("x.csv", new ArrayBuffer(0))).rejects.toThrow(/empty/);
  });
});

describe("matchColumns", () => {
  const columns = [
    { key: "name", label: "Name", required: true },
    { key: "phone", label: "Phone", required: true, aliases: ["Mobile"] },
    { key: "sourceId", label: "Lead source", required: true },
    { key: "email", label: "Email" },
  ];

  it("matches by label, key or alias, ignoring case and punctuation", () => {
    const { mapping, missing, ignored } = matchColumns(["NAME", "mobile", "lead_source", "Remarks"], columns);
    expect(mapping).toEqual({ name: "NAME", phone: "mobile", sourceId: "lead_source" });
    expect(missing).toEqual([]);
    expect(ignored).toEqual(["Remarks"]);
  });

  it("accepts the starred headers of its own template", () => {
    const { mapping } = matchColumns(["Name *", "Phone *", "Lead source *"], columns);
    expect(Object.keys(mapping).sort()).toEqual(["name", "phone", "sourceId"]);
  });

  it("names the required columns the file lacks", () => {
    expect(matchColumns(["Name"], columns).missing).toEqual(["Phone", "Lead source"]);
  });

  it("reads a value through the mapping, or blank when unmapped", () => {
    const { mapping } = matchColumns(["Name"], columns);
    expect(valueOf({ Name: "Asha" }, mapping, "name")).toBe("Asha");
    expect(valueOf({ Name: "Asha" }, mapping, "email")).toBe("");
  });
});

describe("value helpers", () => {
  it("normalises headers", () => {
    expect(normaliseHeader(" Lead Source * ")).toBe("leadsource");
  });

  it("reads numbers as people write them, and leaves nonsense for the validator", () => {
    expect(numberText("₹1,49,22,115")).toBe("14922115");
    expect(numberText("Rs. 12,500.50")).toBe("12500.50");
    expect(numberText("about ten")).toBe("about ten");
  });

  it("reads dates day-first, and refuses days that do not exist", () => {
    expect(dayText("05/04/2026")).toBe("2026-04-05");
    expect(dayText("5.4.2026")).toBe("2026-04-05");
    expect(dayText("2026-04-05")).toBe("2026-04-05");
    expect(dayText("31/02/2026")).toBe("31/02/2026");
  });

  it("reads the month-named dates every export writes, so an export imports straight back", () => {
    expect(dayText("05 Oct 2026")).toBe("2026-10-05");
    expect(dayText("5-October-2026")).toBe("2026-10-05");
    expect(dayText("12 Sept 2026")).toBe("2026-09-12");
    expect(dayText("30 Feb 2026")).toBe("30 Feb 2026");
    expect(dayText("05 Octo 2026")).toBe("05 Octo 2026");
    expect(dayText(new Date(Date.UTC(2026, 9, 5)).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" })))
      .toBe("2026-10-05");
  });

  it("reads yes/no", () => {
    expect(["Yes", "y", "TRUE", "1", "active"].every(truthy)).toBe(true);
    expect(["no", "", "0", "maybe"].some(truthy)).toBe(false);
  });

  it("writes a template with required columns starred", () => {
    const csv = templateCsv([{ key: "name", label: "Name", required: true }, { key: "email", label: "Email" }]);
    expect(csv).toBe('﻿"Name *","Email"\r\n');
  });
});
