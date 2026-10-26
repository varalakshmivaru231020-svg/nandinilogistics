import { describe, expect, it } from "vitest";

import { MASTERS, getMaster, masterGroups } from "@/lib/masters/registry";
import { buildSchema, toPrismaData, defaultOrderBy, searchFilter, listInclude, recordLabel } from "@/lib/masters/schema";
import type { MasterDef } from "@/lib/masters/types";

const companies = getMaster("companies")!;
const designations = getMaster("designations")!;
const stages = getMaster("lead-stages")!;
const numbering = getMaster("numbering-series")!;
const cities = getMaster("cities")!;

describe("master registry", () => {
  it("registers every master with unique keys and models", () => {
    expect(MASTERS.length).toBeGreaterThan(5);
    expect(new Set(MASTERS.map((m) => m.key)).size).toBe(MASTERS.length);
    expect(new Set(MASTERS.map((m) => m.model)).size).toBe(MASTERS.length);
  });

  it("gives every master at least one searchable field", () => {
    const bare = MASTERS.filter((m) => m.searchFields.length === 0);
    expect(bare.map((m) => m.key)).toEqual([]);
  });

  it("gives every master at least one list column", () => {
    const bare = MASTERS.filter((m) => !m.fields.some((f) => f.inList));
    expect(bare.map((m) => m.key)).toEqual([]);
  });

  it("points every select field at fixed options or a lookup table", () => {
    const broken: string[] = [];
    for (const m of MASTERS) {
      for (const f of m.fields) {
        if (f.type === "select" && !f.options && !f.optionsFrom) broken.push(`${m.key}.${f.name}`);
      }
    }
    expect(broken).toEqual([]);
  });

  it("groups every master", () => {
    const grouped = masterGroups().reduce((s, g) => s + g.masters.length, 0);
    expect(grouped).toBe(MASTERS.length);
  });
});

describe("schema building", () => {
  it("requires the fields marked required", () => {
    expect(buildSchema(stages).safeParse({ code: "", name: "", kind: "" }).success).toBe(false);
    expect(buildSchema(cities).safeParse({ name: "Mysuru", stateId: "" }).success).toBe(false);
  });

  it("accepts a complete record", () => {
    const result = buildSchema(stages).safeParse({ code: "TRAINING", name: "Training", kind: "OPEN", sortOrder: 3 });
    expect(result.success).toBe(true);
  });

  it("coerces numeric strings coming off a form", () => {
    const parsed = buildSchema(stages).safeParse({ code: "X", name: "X", kind: "OPEN", sortOrder: "7" });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.sortOrder).toBe(7);
  });

  it("rejects a value below a field's minimum", () => {
    const result = buildSchema(numbering).safeParse({ documentKey: "LEAD", prefix: "LD", padding: 0 });
    expect(result.success).toBe(false);
  });

  it("rejects a malformed email", () => {
    const result = buildSchema(companies).safeParse({ code: "C", name: "C", email: "not-an-email" });
    expect(result.success).toBe(false);
  });
});

describe("value coercion", () => {
  it("uppercases fields flagged uppercase", () => {
    const data = toPrismaData(companies, { code: "peeko", name: "Peeko" });
    expect(data.code).toBe("PEEKO");
    expect(data.name).toBe("Peeko");
  });

  it("turns a blank optional into null rather than an empty string", () => {
    const data = toPrismaData(companies, { code: "X", name: "Y", gstin: "" });
    expect(data.gstin).toBeNull();
  });
});

describe("query shaping", () => {
  it("falls back to a column the master actually has", () => {
    // Numbering series has no `code` column — ordering by it would 500.
    expect(Object.keys(defaultOrderBy(numbering))[0]).not.toBe("code");
    expect(Object.keys(defaultOrderBy(companies))[0]).toBe("code");
    expect(Object.keys(defaultOrderBy(cities))[0]).toBe("name");
    expect(Object.keys(defaultOrderBy(stages))[0]).toBe("sortOrder");
  });

  it("never orders a master by a field it does not define", () => {
    for (const m of MASTERS) {
      const field = Object.keys(defaultOrderBy(m))[0];
      const known = new Set([...m.fields.map((f) => f.name), "createdAt"]);
      expect(known.has(field), `${m.key} orders by unknown field ${field}`).toBe(true);
    }
  });

  it("searches every configured field, case-insensitively", () => {
    const filter = searchFilter(companies, "peeko") as { OR: Array<Record<string, unknown>> };
    expect(filter.OR).toHaveLength(companies.searchFields.length);
    expect(filter.OR[0]).toMatchObject({ [companies.searchFields[0]]: { mode: "insensitive" } });
  });

  it("returns an empty filter for a blank search", () => {
    expect(searchFilter(companies, "   ")).toEqual({});
  });

  it("includes only the relations the list actually shows", () => {
    expect(listInclude(designations)).toEqual({ department: { select: { name: true } } });
    expect(listInclude(getMaster("departments")!)).toBeUndefined();
  });
});

describe("audit labels", () => {
  it("prefers code and name together", () => {
    expect(recordLabel(companies, { code: "PEEKO", name: "Peeko" })).toBe("PEEKO — Peeko");
  });

  it("falls back for a master with no code", () => {
    expect(recordLabel(numbering, { documentKey: "RIDER", prefix: "NL" })).toBe("NL");
  });
});

describe("field config invariants", () => {
  it("gives every field a label", () => {
    const bare: string[] = [];
    for (const m of MASTERS) {
      for (const f of m.fields) if (!f.label?.trim()) bare.push(`${m.key}.${f.name}`);
    }
    expect(bare).toEqual([]);
  });

  it("never repeats a field name within a master", () => {
    const dupes: string[] = [];
    for (const m of MASTERS as MasterDef[]) {
      const seen = new Set<string>();
      for (const f of m.fields) {
        if (seen.has(f.name)) dupes.push(`${m.key}.${f.name}`);
        seen.add(f.name);
      }
    }
    expect(dupes).toEqual([]);
  });
});
