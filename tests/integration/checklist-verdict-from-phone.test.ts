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
import { prisma, seededUsers, tag } from "./helpers";

import { MOBILE_ACTIONS } from "@/lib/api/mobile-actions";
import { buildArgs } from "@/lib/api/mobile-args";
import { remove } from "@/lib/storage";

bindCookieBox(cookieBox);

/**
 * Judging a checklist point from the phone, with a photograph.
 *
 * Found on production: the app sent the remark as a third argument to
 * `reviewChecklistItemAction`, which takes `(itemId, formData)` — so every
 * Approve and Deny from a handset came back "This action takes 2 argument(s),
 * not 3" and no point could be judged at all. The verdict, the remark and the
 * photographs are one body now, as the web's own verdict box posts one.
 *
 * This goes through the boundary's own argument building — the same
 * `buildArgs` the `do` route calls, given exactly what the app sends — and
 * then through the real action, so neither half can drift from the other.
 */
describe("a checklist point judged from the phone", () => {
  const suffix = tag();
  const def = MOBILE_ACTIONS["tasks/reviewChecklistItem"];
  let taskId: string;
  let firstItem: string;
  let secondItem: string;
  let reviewerId: string;
  const stored: string[] = [];

  beforeAll(async () => {
    const { owner, supervisor } = await seededUsers();
    reviewerId = owner.id;

    const checklist = await prisma.checklist.findFirstOrThrow({
      where: { checkpoints: { some: {} } },
      select: { id: true, checkpoints: { select: { id: true }, take: 2, orderBy: { sortOrder: "asc" } } },
    });
    if (checklist.checkpoints.length < 2) throw new Error("Seed a checklist with two checkpoints.");

    const due = new Date(Date.now() + 86_400_000);
    const task = await prisma.task.create({
      data: {
        taskNo: `T-PHONE-${suffix}`,
        title: `Verdict from the phone ${suffix}`,
        kind: "CHECKLIST",
        assigneeId: supervisor.id,
        createdById: owner.id,
        // Two points at one level: approving the first leaves the second
        // waiting, so the task's own status does not move and this test is
        // about the verdict alone.
        status: "UNDER_REVIEW",
        dueAt: due,
        originalDueAt: due,
        effectiveDueAt: due,
        levels: { create: [{ kind: "REVIEW", level: 1, userId: owner.id }] },
        checklists: {
          create: [
            {
              checklistId: checklist.id,
              items: {
                create: checklist.checkpoints.map((c) => ({ checkpointId: c.id })),
              },
            },
          ],
        },
      },
      select: { id: true, checklists: { select: { items: { select: { id: true } } } } },
    });
    taskId = task.id;
    [firstItem, secondItem] = task.checklists[0].items.map((i) => i.id);

    await actAs("owner@nninfra.example");
  });

  afterAll(async () => {
    for (const key of stored) await remove(key).catch(() => undefined);
    await prisma.taskEvent.deleteMany({ where: { taskId } });
    await prisma.task.delete({ where: { id: taskId } }).catch(() => undefined);
    await cleanupActionSessions();
  });

  /** The action itself, as the `do` route calls it once the arguments are built. */
  const call = def.fn as unknown as (
    itemId: string,
    form: FormData,
  ) => Promise<{ ok: boolean; error?: string }>;

  /** The request the app makes: the fields as JSON, the photograph as a part. */
  function asThePhoneSends(itemId: string, body: Record<string, string>, files: File[]) {
    const attached = new FormData();
    for (const f of files) attached.append("files", f);
    return buildArgs(def, [itemId, body], attached) as [string, FormData];
  }

  const jpeg = (name: string) =>
    new File([Buffer.from([0xff, 0xd8, 0xff, 0xdb, 0x00, 0x01])], name, { type: "image/jpeg" });

  it("approves the point, keeps the remark and stores the photograph", async () => {
    const args = asThePhoneSends(
      firstItem,
      { verdict: "APPROVE", remark: "Cover blocks at 25 mm." },
      [jpeg(`photo-${suffix}.jpg`)],
    );

    const res = await call(...args);
    expect(res.error ?? null).toBeNull();
    expect(res.ok).toBe(true);

    const review = await prisma.taskChecklistItemReview.findFirstOrThrow({
      where: { itemId: firstItem },
      select: { verdict: true, remark: true, level: { select: { kind: true, level: true } } },
    });
    // APPROVE is what the body says; PASS is what the record keeps.
    expect(review.verdict).toBe("PASS");
    expect(review.remark).toBe("Cover blocks at 25 mm.");
    expect(review.level).toEqual({ kind: "REVIEW", level: 1 });

    const files = await prisma.taskChecklistItemFile.findMany({
      where: { itemId: firstItem },
      select: { fileName: true, mimeType: true, storageKey: true, uploadedById: true },
    });
    stored.push(...files.map((f) => f.storageKey));
    expect(files).toHaveLength(1);
    expect(files[0].fileName).toBe(`photo-${suffix}.jpg`);
    expect(files[0].mimeType).toBe("image/jpeg");
    expect(files[0].uploadedById).toBe(reviewerId);
  });

  /* A denial sends that point alone back, and takes its photographs too. */
  it("denies the point with no remark at all, as the web allows", async () => {
    const args = asThePhoneSends(secondItem, { verdict: "DENY" }, [jpeg(`snag-${suffix}.jpg`)]);

    const res = await call(...args);
    expect(res.error ?? null).toBeNull();
    expect(res.ok).toBe(true);

    const review = await prisma.taskChecklistItemReview.findFirstOrThrow({
      where: { itemId: secondItem },
      select: { verdict: true, remark: true },
    });
    expect(review.verdict).toBe("FAIL");
    expect(review.remark).toBeNull();

    // The point alone starts its next round; the approved one does not move.
    const [second, first] = await Promise.all([
      prisma.taskChecklistItem.findUniqueOrThrow({ where: { id: secondItem }, select: { round: true } }),
      prisma.taskChecklistItem.findUniqueOrThrow({ where: { id: firstItem }, select: { round: true } }),
    ]);
    expect(second.round).toBe(2);
    expect(first.round).toBe(1);

    const files = await prisma.taskChecklistItemFile.findMany({
      where: { itemId: secondItem },
      select: { fileName: true, storageKey: true },
    });
    stored.push(...files.map((f) => f.storageKey));
    expect(files.map((f) => f.fileName)).toEqual([`snag-${suffix}.jpg`]);
  });

  /* The call the app used to make. It is still refused, by the arity. */
  it("refuses the remark as a third argument", () => {
    expect(() => buildArgs(def, [firstItem, "PASS", "looks fine"], null)).toThrow(
      "takes 2 argument(s), not 3",
    );
  });
});
