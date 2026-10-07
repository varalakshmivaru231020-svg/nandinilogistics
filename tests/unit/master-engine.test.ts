import { describe, expect, it } from "vitest";

import { MASTERS, getMaster, masterGroups } from "@/lib/masters/registry";
import { buildSchema, toPrismaData, defaultOrderBy, searchFilter, listInclude, recordLabel } from "@/lib/masters/schema";
import type { MasterDef } from "@/lib/masters/types";

const items = getMaster("items")!;
const numbering = getMaster("numbering-series")!;
const cities = getMaster("cities")!;

describe("master registry", () => {
  it("registers all 23 masters with unique keys and models", () => {
    expect(MASTERS).toHaveLength(23);
    expect(new Set(MASTERS.map((m) => m.key)).size).toBe(23);
    expect(new Set(MASTERS.map((m) => m.model)).size).toBe(23);
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
    const result = buildSchema(items).safeParse({ code: "", name: "", categoryId: "", uomId: "" });
    expect(result.success).toBe(false);
  });

  it("accepts a complete record", () => {
    const result = buildSchema(items).safeParse({
      code: "CEM-01", name: "Cement", categoryId: "c1", uomId: "u1",
      hsnCode: "2523", taxRateId: "t1", reorderLevel: 100, standardRate: 410,
      isAsset: false, description: "",
    });
    expect(result.success).toBe(true);
  });

  it("coerces numeric strings coming off a form", () => {
    const parsed = buildSchema(items).safeParse({
      code: "X", name: "Y", categoryId: "c", uomId: "u", reorderLevel: "12.5", standardRate: "410",
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.reorderLevel).toBe(12.5);
  });

  it("rejects a value below a field's minimum", () => {
    const result = buildSchema(items).safeParse({
      code: "X", name: "Y", categoryId: "c", uomId: "u", reorderLevel: -5,
    });
    expect(result.success).toBe(false);
  });

  it("rejects a malformed email", () => {
    const vendors = getMaster("vendors")!;
    const result = buildSchema(vendors).safeParse({ code: "V", name: "V", email: "not-an-email" });
    expect(result.success).toBe(false);
  });
});

describe("value coercion", () => {
  it("uppercases fields flagged uppercase", () => {
    const data = toPrismaData(items, { code: "cem-01", name: "Cement", categoryId: "c", uomId: "u" });
    expect(data.code).toBe("CEM-01");
    expect(data.name).toBe("Cement");
  });

  it("turns a blank optional into null rather than an empty string", () => {
    const data = toPrismaData(items, { code: "X", name: "Y", categoryId: "c", uomId: "u", hsnCode: "" });
    expect(data.hsnCode).toBeNull();
  });

  it("always produces a boolean for a checkbox", () => {
    expect(toPrismaData(items, { isAsset: undefined }).isAsset).toBe(false);
    expect(toPrismaData(items, { isAsset: true }).isAsset).toBe(true);
  });
});

describe("query shaping", () => {
  it("falls back to a column the master actually has", () => {
    // Numbering series has no `code` column — ordering by it would 500.
    expect(Object.keys(defaultOrderBy(numbering))[0]).not.toBe("code");
    expect(Object.keys(defaultOrderBy(items))[0]).toBe("code");
    expect(Object.keys(defaultOrderBy(cities))[0]).toBe("name");
  });

  it("never orders a master by a field it does not define", () => {
    for (const m of MASTERS) {
      const field = Object.keys(defaultOrderBy(m))[0];
      const known = new Set([...m.fields.map((f) => f.name), "createdAt"]);
      expect(known.has(field), `${m.key} orders by unknown field ${field}`).toBe(true);
    }
  });

  it("searches every configured field, case-insensitively", () => {
    const filter = searchFilter(items, "cement") as { OR: Array<Record<string, unknown>> };
    expect(filter.OR).toHaveLength(items.searchFields.length);
    expect(filter.OR[0]).toMatchObject({ [items.searchFields[0]]: { mode: "insensitive" } });
  });

  it("returns an empty filter for a blank search", () => {
    expect(searchFilter(items, "   ")).toEqual({});
  });

  it("includes only the relations the list actually shows", () => {
    expect(listInclude(items)).toEqual({
      category: { select: { name: true } },
      uom: { select: { code: true } },
    });
    expect(listInclude(getMaster("departments")!)).toBeUndefined();
  });
});

describe("audit labels", () => {
  it("prefers code and name together", () => {
    expect(recordLabel(items, { code: "CEM-01", name: "Cement" })).toBe("CEM-01 — Cement");
  });

  it("falls back for a master with no code", () => {
    expect(recordLabel(numbering, { documentKey: "INDENT", prefix: "IND" })).toBe("IND");
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
