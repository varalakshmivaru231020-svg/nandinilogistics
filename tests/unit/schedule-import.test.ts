import { describe, expect, it } from "vitest";

import { matchColumns } from "@/lib/import/columns";
import {
  ACTIVITY_IMPORT_COLUMNS, activityExportColumns, formatPredecessors, parsePredecessors, planActivityImport,
  type ActivityImportLookups,
} from "@/lib/schedule/activity-import";

const DAY = 86_400_000;
const D = (iso: string) => new Date(`${iso}T00:00:00.000Z`).getTime();

const HEADERS = ["Code", "Name", "Sequence", "Planned start", "Planned finish", "Duration (days)", "Milestone", "Predecessors"];

function sheet(rows: string[][], headers = HEADERS) {
  return { headers, rows: rows.map((r) => Object.fromEntries(headers.map((h, i) => [h, r[i] ?? ""]))) };
}

const lookups = (over: Partial<ActivityImportLookups> = {}): ActivityImportLookups => ({
  existing: [{ id: "a-exc", code: "EXC" }, { id: "a-pcc", code: "PCC" }],
  existingLinks: [{ predecessorId: "a-exc", successorId: "a-pcc", type: "FS", lagDays: 0 }],
  ...over,
});

const plan = (rows: string[][], over: Partial<ActivityImportLookups> = {}) => planActivityImport(sheet(rows), lookups(over));
const errs = (p: ReturnType<typeof plan>, i: number) => p.rows[i].errors.join(" | ");

describe("parsePredecessors", () => {
  const known = (c: string) => ["EXC", "A+B"].includes(c);
  it("reads codes, lags and whole codes that contain a plus", () => {
    expect(parsePredecessors(" exc, RAFT+3 ; COL + 2d, a+b", known)).toEqual({
      links: [
        { code: "EXC", lagDays: 0 }, { code: "RAFT", lagDays: 3 }, { code: "COL", lagDays: 2 }, { code: "A+B", lagDays: 0 },
      ],
      errors: [],
    });
  });
  it("refuses other link types and negative lags, and lags beyond a year", () => {
    expect(parsePredecessors("EXC (SS+2)", known).errors[0]).toMatch(/only finish-to-start/);
    expect(parsePredecessors("EXC (FS-2)", known).errors[0]).toMatch(/only finish-to-start/);
    expect(parsePredecessors("EXC+400", known).errors[0]).toMatch(/more than 365/);
  });
  it("round-trips what the export writes for finish-to-start links", () => {
    const text = formatPredecessors([{ code: "EXC", type: "FS", lagDays: 0 }, { code: "RAFT", type: "FS", lagDays: 3 }]);
    expect(text).toBe("EXC, RAFT+3");
    expect(parsePredecessors(text, () => false).links).toEqual([{ code: "EXC", lagDays: 0 }, { code: "RAFT", lagDays: 3 }]);
  });
});

describe("planActivityImport", () => {
  it("plans activities with dates, milestone and finish-to-start links to existing and new rows", () => {
    const p = plan([
      ["raft", "Raft foundation", "10", "01/03/2027", "", "8", "no", "EXC"],
      ["COL", "Columns", "20", "2027-03-09", "20 Mar 2027", "", "", "RAFT+2, PCC"],
      ["HANDOVER", "Handover", "30", "01 Apr 2027", "01/04/2027", "0", "yes", "COL"],
    ]);
    expect(p.missing).toEqual([]);
    expect(p.invalid).toBe(0);
    expect(p.rows[0].input).toEqual({
      code: "RAFT", name: "Raft foundation", sequence: 10, start: D("2027-03-01"), end: D("2027-03-01") + 8 * DAY,
      isMilestone: false, predecessors: [{ code: "EXC", lagDays: 0 }],
    });
    expect(p.rows[1].input!.predecessors).toEqual([{ code: "RAFT", lagDays: 2 }, { code: "PCC", lagDays: 0 }]);
    expect(p.rows[2].input!.isMilestone).toBe(true);
  });

  it("reports missing required columns", () => {
    const p = planActivityImport(sheet([["X"]], ["Code"]), lookups());
    expect(p.missing).toEqual(["Name", "Planned start"]);
  });

  it("refuses a code that already exists in the project", () => {
    expect(errs(plan([["exc", "Excavation again", "", "2027-01-01", "", "1"]]), 0)).toMatch(/Code EXC already exists/);
  });

  it("refuses a code repeated in the file", () => {
    const p = plan([["A1", "First", "", "2027-01-01", "", "1"], ["a1", "Second", "", "2027-01-01", "", "1"]]);
    expect(p.rows[0].errors).toEqual([]);
    expect(errs(p, 1)).toMatch(/repeated from row 2/);
  });

  it("refuses a predecessor that is neither in the project nor in the file", () => {
    expect(errs(plan([["A1", "First", "", "2027-01-01", "", "1", "", "NOPE"]]), 0)).toMatch(/Predecessor NOPE is neither/);
  });

  it("refuses finish before start, unreadable dates, and a finish that disagrees with the duration", () => {
    expect(errs(plan([["A1", "First", "", "2027-01-10", "2027-01-05"]]), 0)).toMatch(/finish is before planned start/);
    expect(errs(plan([["A1", "First", "", "next week", "", "3"]]), 0)).toMatch(/is not a date/);
    expect(errs(plan([["A1", "First", "", "2027-01-01", "2027-01-05", "7"]]), 0)).toMatch(/disagree/);
    expect(errs(plan([["A1", "First", "", "2027-01-01", "", ""]]), 0)).toMatch(/planned finish or a duration/);
    expect(errs(plan([["A1", "First", "", "2027-01-01", "", "-2"]]), 0)).toMatch(/not a whole number of days/);
  });

  it("refuses self-dependency and a predecessor named twice", () => {
    expect(errs(plan([["A1", "First", "", "2027-01-01", "", "1", "", "A1"]]), 0)).toMatch(/cannot depend on itself/);
    expect(errs(plan([["A1", "First", "", "2027-01-01", "", "1", "", "EXC, EXC+2"]]), 0)).toMatch(/named twice/);
  });

  it("refuses rows whose predecessors loop back, and names the loop", () => {
    const p = plan([
      ["A1", "First", "", "2027-01-01", "", "1", "", "C1"],
      ["B1", "Second", "", "2027-01-01", "", "1", "", "A1"],
      ["C1", "Third", "", "2027-01-01", "", "1", "", "B1"],
      ["D1", "Fine", "", "2027-01-01", "", "1", "", "EXC"],
    ]);
    for (const i of [0, 1, 2]) expect(errs(p, i)).toMatch(/loop back on themselves \(.*→.*\)/);
    expect(p.rows[3].errors).toEqual([]);
    expect(p.valid).toBe(1);
  });

  it("checks loops against the project's own links too", () => {
    // Existing: EXC → PCC. A new row cannot put EXC after anything new that waits on PCC,
    // but new rows never gain existing successors — so an import alone cannot close such a loop.
    const p = plan([["N1", "New", "", "2027-01-01", "", "1", "", "PCC"]], {
      existingLinks: [{ predecessorId: "a-exc", successorId: "a-pcc", type: "FS", lagDays: 0 }],
    });
    expect(p.rows[0].errors).toEqual([]);
  });

  it("refuses a row that waits on a refused row, transitively", () => {
    const p = plan([
      ["A1", "Broken", "", "2027-01-10", "2027-01-01"],
      ["B1", "Waits on A1", "", "2027-01-11", "", "1", "", "A1"],
      ["C1", "Waits on B1", "", "2027-01-12", "", "1", "", "B1"],
    ]);
    expect(errs(p, 1)).toMatch(/Predecessor A1 on row 2 cannot be imported/);
    expect(errs(p, 2)).toMatch(/Predecessor B1 on row 3 cannot be imported/);
    expect(p.valid).toBe(0);
  });

  it("reads every importable column back from the export's headers", () => {
    const headers = activityExportColumns({ baseline: true, criticalPath: true }).map((c) => c.header);
    const { mapping, missing, ignored } = matchColumns(headers, ACTIVITY_IMPORT_COLUMNS);
    expect(missing).toEqual([]);
    expect(Object.keys(mapping).sort()).toEqual(ACTIVITY_IMPORT_COLUMNS.map((c) => c.key).sort());
    expect(ignored.sort()).toEqual(
      ["Actual finish", "Actual start", "Baseline finish", "Baseline start", "Critical path", "Progress", "Status"].sort(),
    );
  });
});
