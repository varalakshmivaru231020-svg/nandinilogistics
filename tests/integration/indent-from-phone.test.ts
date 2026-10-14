import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const cookieBox = vi.hoisted(() => ({ value: null as string | null }));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      name === "nn_session" && cookieBox.value ? { name, value: cookieBox.value } : undefined,
    set: () => undefined,
    delete: () => undefined,
  }),
  headers: async () => new Map<string, string>(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: () => undefined,
  revalidateTag: () => undefined,
}));

import { actAs, bindCookieBox, cleanupActionSessions } from "./action-harness";
import { cleanupItemAndStore, demoProject, makeItemAndStore, n, prisma, tag } from "./helpers";

import * as indents from "@/app/(app)/material/indents/actions";

bindCookieBox(cookieBox);

/**
 * Raising an indent the way a phone raises one.
 *
 * The web form worked two things out for itself before calling the action: the
 * work package whose name the typed activity matches, and what each line is
 * worth at the item's standard rate. Anything that called the action without
 * repeating that arithmetic — the mobile boundary — produced an indent
 * attributed to no work package and valued at zero, which is the figure the
 * approval ceilings are read against.
 *
 * So the action settles both now. These raise one with the sparse payload a
 * phone sends and check the document that comes out is the document the web
 * would have produced.
 */
describe("an indent raised without the web form's arithmetic", () => {
  const suffix = tag();
  let projectId: string;
  let itemId: string;
  let storeId: string;
  let packageName: string;
  let packageId: string;
  let standardRate: number;
  const raised: string[] = [];

  beforeAll(async () => {
    const [{ item, store }, project] = await Promise.all([
      makeItemAndStore(suffix),
      demoProject(),
    ]);
    projectId = project.id;
    itemId = item.id;
    storeId = store.id;
    standardRate = n(item.standardRate);

    const pack = await prisma.workPackage.findFirst({
      where: { status: "ACTIVE", phase: { projectId } },
      select: { id: true, name: true },
    });
    if (!pack) throw new Error("Seed a work package first.");
    packageId = pack.id;
    packageName = pack.name;

    await actAs("owner@nninfra.example");
  });

  afterAll(async () => {
    await prisma.indentItem.deleteMany({ where: { indentId: { in: raised } } });
    await prisma.indent.deleteMany({ where: { id: { in: raised } } });
    await cleanupItemAndStore(itemId, storeId);
    await cleanupActionSessions();
  });

  async function raise(input: Parameters<typeof indents.createIndentAction>[0]) {
    const res = await indents.createIndentAction(input, false);
    expect(res.ok, res.ok ? "" : res.error).toBe(true);
    if (!res.ok) throw new Error(res.error);
    raised.push(res.data.id);
    return prisma.indent.findUniqueOrThrow({
      where: { id: res.data.id },
      include: { items: true },
    });
  }

  it("values a line with no rate on it from the item master", async () => {
    const indent = await raise({
      projectId,
      requiredByDate: new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10),
      purpose: "Slab casting floor 7",
      remarks: `From a phone ${suffix}`,
      items: [{ itemId, requestedQty: 20 }],
    });

    expect(n(indent.items[0].estimatedRate)).toBe(standardRate);
    expect(n(indent.estimatedValue)).toBe(20 * standardRate);
  });

  it("ties it to the work package the activity names", async () => {
    const indent = await raise({
      projectId,
      requiredByDate: new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10),
      // Typed, in the wrong case, as somebody would type it.
      purpose: packageName.toUpperCase(),
      remarks: `From a phone ${suffix}`,
      items: [{ itemId, requestedQty: 5 }],
    });

    expect(indent.workPackageId).toBe(packageId);
    expect(indent.purpose).toBe(packageName.toUpperCase());
  });

  it("leaves it on no package where the activity names none", async () => {
    const indent = await raise({
      projectId,
      requiredByDate: new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10),
      purpose: "Slab casting floor 7",
      remarks: `From a phone ${suffix}`,
      items: [{ itemId, requestedQty: 5 }],
    });

    expect(indent.workPackageId).toBeNull();
  });

  /// A rate that was sent is the rate that is stored, as the web sends one.
  it("keeps a rate the caller did send", async () => {
    const indent = await raise({
      projectId,
      requiredByDate: new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10),
      workPackageId: packageId,
      purpose: "Slab casting floor 7",
      remarks: `From the web ${suffix}`,
      items: [{ itemId, requestedQty: 10, estimatedRate: 777 }],
    });

    expect(n(indent.items[0].estimatedRate)).toBe(777);
    expect(n(indent.estimatedValue)).toBe(7_770);
    // An id that was given is not second-guessed by the matcher.
    expect(indent.workPackageId).toBe(packageId);
  });
});
