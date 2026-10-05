import { describe, expect, it } from "vitest";

import { documentChains } from "@/lib/projects/document-chains";

const doc = (id: string, version: number, supersedesId: string | null, day: number) => ({
  id, version, supersedesId, createdAt: `2026-03-${String(day).padStart(2, "0")}T09:00:00.000Z`,
});

describe("documentChains", () => {
  it("leads with the version nothing supersedes", () => {
    const chains = documentChains([doc("a", 1, null, 1), doc("b", 2, "a", 2)]);
    expect(chains).toHaveLength(1);
    expect(chains[0].current.id).toBe("b");
    expect(chains[0].older.map((d) => d.id)).toEqual(["a"]);
  });

  it("lists older versions newest first", () => {
    const chains = documentChains([
      doc("v1", 1, null, 1), doc("v2", 2, "v1", 2), doc("v3", 3, "v2", 3),
    ]);
    expect(chains[0].current.id).toBe("v3");
    expect(chains[0].older.map((d) => d.id)).toEqual(["v2", "v1"]);
  });

  it("keeps unrelated documents in separate chains, newest first", () => {
    const chains = documentChains([doc("old", 1, null, 1), doc("new", 1, null, 5)]);
    expect(chains.map((c) => c.current.id)).toEqual(["new", "old"]);
  });

  it("gives a document with no history an empty older list", () => {
    expect(documentChains([doc("only", 1, null, 1)])[0].older).toEqual([]);
  });

  it("stops at a version that is not in the list rather than losing the chain", () => {
    const chains = documentChains([doc("v3", 3, "missing", 3)]);
    expect(chains).toHaveLength(1);
    expect(chains[0].current.id).toBe("v3");
    expect(chains[0].older).toEqual([]);
  });

  it("does not loop on a cycle", () => {
    const chains = documentChains([doc("a", 1, "b", 1), doc("b", 2, "a", 2)]);
    // Neither is a head, so neither leads — but the walk still terminates.
    expect(chains).toEqual([]);
  });

  it("returns nothing for an empty repository", () => {
    expect(documentChains([])).toEqual([]);
  });
});
