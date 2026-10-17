import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { FORMS } from "@/lib/forms/registry";
import type { FormFieldDef } from "@/lib/forms/types";

/**
 * A control the web opens already answered, opened already answered here.
 *
 * Five of the web's screens hold a required select as `stores[0]?.id ?? ""` or
 * `defaultValue={projects[0]?.id}`, which means the person at the desk never
 * chooses it. The phone drew the same field blank, so somebody on site had to
 * — and on the goods receipt it refused the receipt outright until they did:
 * "Receiving store is required."
 *
 * `startsFirst` says so, and this reads the web's own screen back, in both
 * directions: the claim has to be true, and a web control that preselects has
 * to be claimed.
 */

const ROOT = process.cwd();
const read = (p: string) => readFileSync(`${ROOT}/src/app/(app)/${p}`, "utf-8");

/** Where the web starts on its first option, and which field that is. */
const PRESELECTS: Array<{ file: string; name: string; form?: string }> = [
  { file: "projects/new-project-button.tsx", name: "projectTypeId", form: "projects/projects:create" },
  { file: "projects/progress/progress-screen.tsx", name: "projectId", form: "projects/progress:create" },
  { file: "material/transfers/transfers-screen.tsx", name: "fromStoreId", form: "material/transfers:create" },
  // The receiving store is a field of the purchase order's own Receive goods
  // action rather than of a form, so it carries `initial` directly; the record
  // test below reads it.
  { file: "material/grn/new/grn-form.tsx", name: "storeId" },
  // The availability board's tower chooser is a filter, not a field — the
  // phone's board opens on the first tower in the same way.
  { file: "units/board/board-grid.tsx", name: "blockId" },
];

function fieldsOf(key: string): FormFieldDef[] {
  const form = FORMS[key];
  expect(form, `${key} is not in the registry`).toBeTruthy();
  return [...form.fields] as FormFieldDef[];
}

describe("a field the web opens answered", () => {
  for (const { file, name, form } of PRESELECTS) {
    it(`${file} → ${name}`, () => {
      const src = read(file);
      // The web really does start on the first one.
      const starts =
        /useState\(\s*\w+\[0\]\?\.id/.test(src) || /defaultValue=\{\w+\[0\]\?\.id/.test(src);
      expect(starts, `${file} no longer opens on its first option`).toBe(true);

      if (!form) return;
      const field = fieldsOf(form).find((f) => f.name === name);
      expect(field, `${form} has no ${name}`).toBeTruthy();
      expect(
        field!.startsFirst,
        `${form} → ${name} must open on its first option, as ${file} does`,
      ).toBe(true);
    });
  }

  it("claims it nowhere else", () => {
    const claimed: string[] = [];
    for (const [key, form] of Object.entries(FORMS)) {
      for (const f of form.fields) {
        if (f.startsFirst) claimed.push(`${key} → ${f.name}`);
      }
    }
    // Exactly the three forms above. Anything else is a phone choosing for
    // somebody where the web asked them.
    expect(claimed.sort()).toEqual([
      "material/transfers:create → fromStoreId",
      "projects/progress:create → projectId",
      "projects/projects:create → projectTypeId",
      "projects/projects:edit → projectTypeId",
    ]);
  });

  /* The receiving store, which is a record action's field. */
  it("the goods receipt opens on a store", () => {
    const record = readFileSync(`${ROOT}/src/lib/records/purchase-order.ts`, "utf-8");
    expect(record.includes("initial: stores[0]?.id")).toBe(true);
  });
});
