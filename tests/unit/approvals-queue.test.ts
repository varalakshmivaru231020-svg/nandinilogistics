import { describe, expect, it } from "vitest";

import {
  APPROVAL_KINDS, KIND_LABEL, byOldestFirst, countByKind, filterApprovals,
  needsDelayClassification, waitingFor, type ApprovalKind, type ApprovalRow,
} from "@/lib/approvals/queue";

const row = (over: Partial<ApprovalRow>): ApprovalRow => ({
  id: "1", kind: "INDENT", reference: "IND/NNS/0001", title: "OPC 53 Cement",
  raisedBy: "Ravi Shankar", raisedAt: "2026-09-01T00:00:00.000Z", projectName: "NN Skyline",
  value: 100000, waitingOn: "Project Manager", href: "/material/indents/1", canDecide: true,
  ...over,
});

describe("waitingFor", () => {
  const now = new Date("2026-09-10T00:00:00.000Z").getTime();
  it("counts whole days, and says today rather than 0 days", () => {
    expect(waitingFor("2026-09-10T06:00:00.000Z", now)).toBe("today");
    expect(waitingFor("2026-09-09T00:00:00.000Z", now)).toBe("1 day");
    expect(waitingFor("2026-09-01T00:00:00.000Z", now)).toBe("9 days");
  });
});

describe("filterApprovals", () => {
  const rows = [
    row({ id: "a", kind: "INDENT", reference: "IND/NNS/0001", raisedBy: "Ravi Shankar" }),
    row({ id: "b", kind: "PO", reference: "PO/NNS/0007", title: "TMT Steel", raisedBy: "Girish Patil" }),
    row({ id: "c", kind: "EXTENSION", reference: "Slab 2", title: "5 more days", projectName: "NN Riverview" }),
  ];

  it("keeps everything when nothing is asked", () => {
    expect(filterApprovals(rows, { kind: "all", q: "" })).toHaveLength(3);
  });

  it("narrows to one kind", () => {
    expect(filterApprovals(rows, { kind: "PO", q: "" }).map((r) => r.id)).toEqual(["b"]);
  });

  it("finds by the number on the paper", () => {
    expect(filterApprovals(rows, { kind: "all", q: "0007" }).map((r) => r.id)).toEqual(["b"]);
  });

  it("finds by who raised it, and by project", () => {
    expect(filterApprovals(rows, { kind: "all", q: "girish" }).map((r) => r.id)).toEqual(["b"]);
    expect(filterApprovals(rows, { kind: "all", q: "riverview" }).map((r) => r.id)).toEqual(["c"]);
  });

  it("applies the kind and the search together", () => {
    expect(filterApprovals(rows, { kind: "INDENT", q: "girish" })).toEqual([]);
  });
});

describe("byOldestFirst", () => {
  it("puts what has waited longest at the top", () => {
    const rows = [
      row({ id: "new", raisedAt: "2026-09-09T00:00:00.000Z" }),
      row({ id: "old", raisedAt: "2026-09-01T00:00:00.000Z" }),
    ];
    expect(byOldestFirst(rows).map((r) => r.id)).toEqual(["old", "new"]);
  });

  it("does not disturb the list it was given", () => {
    const rows = [row({ id: "new", raisedAt: "2026-09-09T00:00:00.000Z" }), row({ id: "old", raisedAt: "2026-09-01T00:00:00.000Z" })];
    byOldestFirst(rows);
    expect(rows.map((r) => r.id)).toEqual(["new", "old"]);
  });
});

describe("countByKind", () => {
  it("counts each kind and the whole", () => {
    const counts = countByKind([row({ kind: "INDENT" }), row({ kind: "INDENT" }), row({ kind: "PO" })]);
    expect(counts.all).toBe(3);
    expect(counts.INDENT).toBe(2);
    expect(counts.PO).toBe(1);
    expect(counts.TRANSFER).toBe(0);
  });
});

describe("Task Management joins the same queue", () => {
  it("offers the four task decisions alongside the material ones", () => {
    for (const k of ["TASK_CLOSURE", "TASK_EXTENSION", "TASK_REVIEW", "TASK_APPROVAL"]) {
      expect(APPROVAL_KINDS).toContain(k);
      expect(KIND_LABEL[k as ApprovalKind]).toBeTruthy();
    }
  });

  it("names them so two kinds of extension are told apart", () => {
    expect(KIND_LABEL.EXTENSION).toBe("Schedule extension");
    expect(KIND_LABEL.TASK_EXTENSION).toBe("Task extension");
  });

  it("asks how a task delay should be classified, and only there", () => {
    expect(needsDelayClassification("TASK_EXTENSION")).toBe(true);
    for (const k of ["TASK_CLOSURE", "TASK_REVIEW", "TASK_APPROVAL", "INDENT", "PO"]) {
      expect(needsDelayClassification(k as ApprovalKind), k).toBe(false);
    }
  });

  it("filters and counts the task kinds like any other", () => {
    const rows: ApprovalRow[] = [
      row({ kind: "TASK_REVIEW", reference: "T-9005", title: "Handover — Flat A-1203" }),
      row({ kind: "TASK_CLOSURE", reference: "T-9004", title: "Scaffold removal" }),
      row({ kind: "INDENT", reference: "IND-1", title: "Cement" }),
    ];
    expect(filterApprovals(rows, { kind: "TASK_REVIEW", q: "" })).toHaveLength(1);
    expect(countByKind(rows).TASK_CLOSURE).toBe(1);
    expect(filterApprovals(rows, { kind: "all", q: "handover" })).toHaveLength(1);
    expect(filterApprovals(rows, { kind: "all", q: "T-900" })).toHaveLength(2);
  });

  it("sorts a task decision into the same oldest-first order", () => {
    const rows: ApprovalRow[] = [
      row({ kind: "INDENT", raisedAt: "2026-09-20T10:00:00.000Z" }),
      row({ kind: "TASK_REVIEW", raisedAt: "2026-09-18T10:00:00.000Z" }),
    ];
    expect(byOldestFirst(rows)[0].kind).toBe("TASK_REVIEW");
  });
});
