import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { formatSeriesNumber, nextDocumentNumber } from "@/lib/numbering";
import { prisma, stageOfKind, tag } from "./helpers";

describe("document numbering", () => {
  const suffix = tag();
  const key = `TEST_${suffix}`;
  let seriesId: string;

  beforeAll(async () => {
    const series = await prisma.numberingSeries.create({
      data: {
        documentKey: key,
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
    const no = await prisma.$transaction((tx) => nextDocumentNumber(tx, key));
    expect(no).toBe(`TST/${suffix}/2026-27/0001`);
  });

  it("runs the prefix straight into the digits when there is no fiscal year — the Rider ID", () => {
    expect(formatSeriesNumber({ prefix: "NL", fiscalYear: null, padding: 3 }, 7)).toBe("NL007");
  });

  it("increments on each call", async () => {
    const second = await prisma.$transaction((tx) => nextDocumentNumber(tx, key));
    const third = await prisma.$transaction((tx) => nextDocumentNumber(tx, key));
    expect(second).toContain("0002");
    expect(third).toContain("0003");
  });

  it("never issues the same number twice under concurrency", async () => {
    // Twenty simultaneous callers must produce twenty distinct numbers.
    const numbers = await Promise.all(
      Array.from({ length: 20 }, () => prisma.$transaction((tx) => nextDocumentNumber(tx, key))),
    );
    expect(new Set(numbers).size).toBe(20);
  });

  it("falls back to a unique number when no series is configured", async () => {
    const no = await prisma.$transaction((tx) => nextDocumentNumber(tx, `UNCONFIGURED_${suffix}`));
    expect(no).toContain(`UNCONFIGURED_${suffix}`);
  });

  /*
   * The counter and the rows it numbers drift apart whenever a document is
   * written with a number of its own. A Rider ID typed by hand, a restore
   * without the counter — the next number must step over what is taken.
   */
  it("steps over a number already on a row, and leaves the counter past it", async () => {
    const series = await prisma.numberingSeries.findFirstOrThrow({ where: { documentKey: "LEAD" } });
    const before = series.nextNumber;
    const taken = formatSeriesNumber(series, before);

    const stage = await stageOfKind("NEW");
    const squatter = await prisma.lead.create({
      data: { leadNo: taken, name: `Numbering squatter ${suffix}`, phone: "9000000000", stageId: stage.id },
    });
    try {
      const issued = await prisma.$transaction((tx) => nextDocumentNumber(tx, "LEAD"));
      expect(issued).not.toBe(taken);
      expect(issued).toBe(formatSeriesNumber(series, before + 1));

      const after = await prisma.numberingSeries.findUniqueOrThrow({ where: { id: series.id } });
      expect(after.nextNumber).toBe(before + 2);
    } finally {
      await prisma.lead.delete({ where: { id: squatter.id } });
      await prisma.numberingSeries.update({ where: { id: series.id }, data: { nextNumber: before } });
    }
  });
});
