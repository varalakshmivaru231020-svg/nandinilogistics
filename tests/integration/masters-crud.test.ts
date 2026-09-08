import { afterAll, describe, expect, it } from "vitest";

import { MASTERS } from "@/lib/masters/registry";
import { buildSchema, defaultOrderBy, listInclude, searchFilter, toPrismaData } from "@/lib/masters/schema";
import type { MasterDef } from "@/lib/masters/types";
import { prisma, tag } from "./helpers";

/* eslint-disable @typescript-eslint/no-explicit-any */
const delegate = (m: MasterDef) => (prisma as any)[m.model];

/** A plausible value for each field, so validation genuinely passes. */
async function sampleForm(def: MasterDef, suffix: string) {
  const form: Record<string, unknown> = {};
  for (const f of def.fields) {
    if (f.type === "checkbox") { form[f.name] = false; continue; }
    if (f.type === "number") { form[f.name] = f.min ?? 1; continue; }
    if (f.type === "decimal") { form[f.name] = 1.5; continue; }
    if (f.type === "email") { form[f.name] = `t${suffix}@example.com`; continue; }
    if (f.type === "select") {
      if (f.options?.length) { form[f.name] = f.options[0].value; continue; }
      if (f.optionsFrom) {
        const row = await (prisma as any)[f.optionsFrom.model].findFirst({ select: { id: true } });
        form[f.name] = row?.id ?? "";
        continue;
      }
      form[f.name] = "";
      continue;
    }
    form[f.name] = f.name === "code" ? `ZZ${suffix}` : `Verify ${suffix}`;
  }
  return form;
}

afterAll(async () => {
  await prisma.$disconnect();
});

/**
 * The generic master engine is one code path serving 22 different tables — a
 * config mistake in the registry surfaces here rather than in front of a user.
 */
describe.each(MASTERS.map((m) => [m.key, m] as const))("master: %s", (_key, def) => {
  it("runs the list query the screen actually issues", async () => {
    await expect(
      delegate(def).findMany({
        where: searchFilter(def, "a"),
        include: listInclude(def),
        orderBy: defaultOrderBy(def),
        take: 1,
      }),
    ).resolves.toBeDefined();
  });

  it("completes a create / update / delete cycle", async () => {
    const suffix = tag().slice(1, 6);
    const parsed = buildSchema(def).safeParse(await sampleForm(def, suffix));
    expect(parsed.success, `validation failed for ${def.key}`).toBe(true);
    if (!parsed.success) return;

    const data = toPrismaData(def, parsed.data as Record<string, unknown>);
    const created = await delegate(def).create({ data });
    expect(created.id).toBeTruthy();

    const updated = await delegate(def).update({
      where: { id: created.id },
      data: { status: "INACTIVE" },
    });
    expect(updated.status).toBe("INACTIVE");

    await delegate(def).delete({ where: { id: created.id } });
    expect(await delegate(def).findUnique({ where: { id: created.id } })).toBeNull();
  });
});
