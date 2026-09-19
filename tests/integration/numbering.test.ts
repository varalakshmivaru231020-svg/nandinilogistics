import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { nextDocumentNumber } from "@/lib/numbering";
import { demoProject, prisma, tag } from "./helpers";

describe("document numbering", () => {
  const suffix = tag();
  const key = `TEST_${suffix}`;
  let projectId: string;
  let seriesId: string;

  beforeAll(async () => {
    const project = await demoProject();
    projectId = project.id;
    const series = await prisma.numberingSeries.create({
      data: {
        documentKey: key,
        projectId,
        prefix: `TST/${suffix}`,
        fiscalYear: "2026-27",
        padding: 4,
        nextNumber: 1,
      },
    });
    seriesId = series.id;
  });

  afterAll(async () => {
    await prisma.numberingSeries.delete({ where: { id: seriesId } }).catch(() => undefined);
    await prisma.$disconnect();
  });

  it("builds the number from prefix, fiscal year and a padded sequence", async () => {
    const no = await prisma.$transaction((tx) => nextDocumentNumber(tx, key, projectId));
    expect(no).toBe(`TST/${suffix}/2026-27/0001`);
  });

  it("increments on each call", async () => {
    const second = await prisma.$transaction((tx) => nextDocumentNumber(tx, key, projectId));
    const third = await prisma.$transaction((tx) => nextDocumentNumber(tx, key, projectId));
    expect(second).toContain("0002");
    expect(third).toContain("0003");
  });

  it("never issues the same number twice under concurrency", async () => {
    // Twenty simultaneous callers must produce twenty distinct numbers.
    const numbers = await Promise.all(
      Array.from({ length: 20 }, () =>
        prisma.$transaction((tx) => nextDocumentNumber(tx, key, projectId)),
      ),
    );
    expect(new Set(numbers).size).toBe(20);
  });

  it("falls back to a unique number when no series is configured", async () => {
    const no = await prisma.$transaction((tx) =>
      nextDocumentNumber(tx, `UNCONFIGURED_${suffix}`, projectId),
    );
    expect(no).toContain(`UNCONFIGURED_${suffix}`);
  });

  /*
   * The counter and the rows it numbers drift apart whenever a document is
   * written with a number of its own — the demo data does exactly that, and a
   * seeded database could not book a flat because the first cost sheet and the
   * first booking both collided on a unique constraint.
   */
  it("steps over a number already on a row, and leaves the counter past it", async () => {
    const project = await demoProject();
    const series = await prisma.numberingSeries.findFirstOrThrow({
      where: { documentKey: "LEAD", projectId: project.id },
    });
    const before = series.nextNumber;
    const taken = [series.prefix, series.fiscalYear, String(before).padStart(series.padding, "0")]
      .filter(Boolean)
      .join("/");

    const source = await prisma.leadSource.findFirstOrThrow();
    const squatter = await prisma.lead.create({
      data: { leadNo: taken, name: `Numbering squatter ${suffix}`, phone: "9000000000", sourceId: source.id },
    });
    try {
      const issued = await prisma.$transaction((tx) => nextDocumentNumber(tx, "LEAD", project.id));
      expect(issued).not.toBe(taken);

      const after = await prisma.numberingSeries.findUniqueOrThrow({ where: { id: series.id } });
      expect(after.nextNumber).toBeGreaterThan(before + 1);

      // And the number it did hand out is free.
      expect(await prisma.lead.findFirst({ where: { leadNo: issued } })).toBeNull();
    } finally {
      await prisma.lead.delete({ where: { id: squatter.id } });
      await prisma.numberingSeries.update({ where: { id: series.id }, data: { nextNumber: before } });
    }
  });

  it("prefers a project series over a platform-wide one", async () => {
    const globalSeries = await prisma.numberingSeries.create({
      data: { documentKey: key, projectId: null, prefix: "GLOBAL", padding: 4, nextNumber: 900 },
    });
    try {
      const no = await prisma.$transaction((tx) => nextDocumentNumber(tx, key, projectId));
      expect(no).toContain(`TST/${suffix}`);
      expect(no).not.toContain("GLOBAL");
    } finally {
      await prisma.numberingSeries.delete({ where: { id: globalSeries.id } });
    }
  });
});
