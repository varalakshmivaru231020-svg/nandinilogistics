import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { postStockMovement } from "@/lib/inventory";
import { cancelIssue } from "@/lib/material/issue-cancel";
import { approveReturn, deletePendingReturn, raiseReturn, rejectReturn } from "@/lib/material/returns";
import { cleanupItemAndStore, makeItemAndStore, n, prisma, seededUsers, tag } from "./helpers";

/**
 * Issue cancellation and material returns against the real database, on a
 * throwaway project, store and item — nothing seeded is touched.
 *
 * Stock in: 100 @ 500 and 50 @ 620 → 150 at an average of 540.
 */
describe("material returns and issue cancellation", () => {
  const S = tag();
  let projectId: string;
  let itemId: string;
  let storeId: string;
  let seriesId: string;
  let userId: string;
  let otherUserId: string;
  const everyone = { canAccessAllProjects: true, projectIds: [] };
  let issueSeq = 0;

  const balance = async () => {
    const b = await prisma.stockBalance.findUniqueOrThrow({ where: { itemId_storeId: { itemId, storeId } } });
    return { quantity: n(b.quantity), avgRate: n(b.avgRate), value: n(b.value) };
  };
  const ledgerCount = () => prisma.stockLedger.count({ where: { itemId } });
  const now = () => new Date();

  /** Issues stock the way createIssueAction does: out at the average, line valued at it. */
  async function issue(quantity: number) {
    issueSeq += 1;
    return prisma.$transaction(async (tx) => {
      const issueNo = `ISS/TEST/${S}/${issueSeq}`;
      const created = await tx.materialIssue.create({
        data: { issueNo, projectId, storeId, issuedToId: userId, issuedById: userId },
      });
      const movement = await postStockMovement(tx, {
        itemId, storeId, projectId, txnType: "ISSUE_OUT", quantity,
        refType: "ISSUE", refId: created.id, refNo: issueNo, issueId: created.id, createdById: userId,
      });
      const line = await tx.materialIssueItem.create({
        data: { issueId: created.id, itemId, issuedQty: quantity, rate: movement.rate, value: movement.value },
      });
      await tx.materialIssue.update({ where: { id: created.id }, data: { totalValue: movement.value } });
      return { id: created.id, issueNo, lineId: line.id };
    });
  }

  const raise = (issueId: string, issueItemId: string, quantity: number, raisedBy = userId) =>
    prisma.$transaction((tx) =>
      raiseReturn(tx, {
        issueId, userId: raisedBy, scope: everyone, reason: "Surplus after pour",
        lines: [{ issueItemId, quantity, condition: "Good" }], now: now(),
      }),
    );

  beforeAll(async () => {
    const [type, users, { item, store }] = await Promise.all([
      prisma.projectType.findFirstOrThrow(),
      seededUsers(),
      makeItemAndStore(S),
    ]);
    userId = users.store.id;
    otherUserId = users.supervisor.id;
    itemId = item.id;
    storeId = store.id;

    projectId = (await prisma.project.create({
      data: { code: `MRT-${S}`, name: `Material returns ${S}`, projectTypeId: type.id },
    })).id;
    seriesId = (await prisma.numberingSeries.create({
      data: { documentKey: "RETURN", projectId, prefix: `RET/${S}`, fiscalYear: "2026-27", padding: 4 },
    })).id;

    await prisma.$transaction(async (tx) => {
      await postStockMovement(tx, {
        itemId, storeId, projectId, txnType: "GRN_IN", quantity: 100, rate: 500, refType: "TEST", refId: `grn-1-${S}`,
      });
      await postStockMovement(tx, {
        itemId, storeId, projectId, txnType: "GRN_IN", quantity: 50, rate: 620, refType: "TEST", refId: `grn-2-${S}`,
      });
    });
  });

  afterAll(async () => {
    if (projectId) {
      await prisma.materialReturn.deleteMany({ where: { projectId } });
      await prisma.stockLedger.deleteMany({ where: { itemId } });
      await prisma.materialIssue.deleteMany({ where: { projectId } });
    }
    if (itemId) await cleanupItemAndStore(itemId, storeId);
    if (seriesId) await prisma.numberingSeries.delete({ where: { id: seriesId } }).catch(() => undefined);
    if (projectId) await prisma.project.delete({ where: { id: projectId } }).catch(() => undefined);
    await prisma.$disconnect();
  });

  describe("an issue with a part return, then cancelled", () => {
    let a: { id: string; issueNo: string; lineId: string };

    it("starts from 150 at an average of 540", async () => {
      expect(await balance()).toEqual({ quantity: 150, avgRate: 540, value: 81_000 });
      a = await issue(40);
      expect((await balance()).quantity).toBe(110);
    });

    it("raise → approve returns stock at the issue rate and advances returnedQty", async () => {
      const raised = await raise(a.id, a.lineId, 15);
      expect(raised.returnNo).toBe(`RET/${S}/2026-27/0001`);
      expect((await balance()).quantity).toBe(110); // nothing moves while pending

      const approved = await prisma.$transaction((tx) =>
        approveReturn(tx, { returnId: raised.id, userId, note: null, now: now() }),
      );
      expect(approved.totalValue).toBe(15 * 540);

      const b = await balance();
      expect(b.quantity).toBe(125);
      expect(b.avgRate).toBe(540);

      const line = await prisma.materialIssueItem.findUniqueOrThrow({ where: { id: a.lineId } });
      expect(n(line.returnedQty)).toBe(15);

      const ret = await prisma.materialReturn.findUniqueOrThrow({ where: { id: raised.id } });
      expect(ret.status).toBe("APPROVED");
      expect(ret.decidedById).toBe(userId);
      expect(await prisma.stockLedger.count({ where: { refId: raised.id, txnType: "RETURN_IN" } })).toBe(1);
    });

    it("cancel puts back exactly the unreturned quantity at the issue rate", async () => {
      const result = await prisma.$transaction((tx) =>
        cancelIssue(tx, { issueId: a.id, userId, reason: "Issued against the wrong work package", now: now() }),
      );
      expect(result.linesPutBack).toBe(1);
      expect(result.valuePutBack).toBe(25 * 540);

      // Balance and average back where they were before the issue.
      expect(await balance()).toEqual({ quantity: 150, avgRate: 540, value: 81_000 });

      const rows = await prisma.stockLedger.findMany({ where: { refId: a.id, txnType: "ISSUE_CANCEL" } });
      expect(rows).toHaveLength(1);
      expect(n(rows[0].quantity)).toBe(25);
      expect(n(rows[0].rate)).toBe(540);
      expect(rows[0].refType).toBe("ISSUE_CANCEL");
      expect(rows[0].issueId).toBe(a.id);

      const cancelled = await prisma.materialIssue.findUniqueOrThrow({ where: { id: a.id } });
      expect(cancelled.cancelledAt).not.toBeNull();
      expect(cancelled.cancelReason).toBe("Issued against the wrong work package");
    });

    it("a second cancel refuses and moves no stock", async () => {
      const before = await ledgerCount();
      await expect(
        prisma.$transaction((tx) => cancelIssue(tx, { issueId: a.id, userId, reason: "again", now: now() })),
      ).rejects.toThrow(/already cancelled/);
      expect(await ledgerCount()).toBe(before);
      expect((await balance()).quantity).toBe(150);
    });

    it("a double click puts stock back once", async () => {
      const b = await issue(5);
      const before = await ledgerCount();
      const results = await Promise.allSettled([
        prisma.$transaction((tx) => cancelIssue(tx, { issueId: b.id, userId, reason: "dup", now: now() })),
        prisma.$transaction((tx) => cancelIssue(tx, { issueId: b.id, userId, reason: "dup", now: now() })),
      ]);
      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      expect(await ledgerCount()).toBe(before + 1);
      expect((await balance()).quantity).toBe(150);
    });

    it("a return against a cancelled issue refuses", async () => {
      await expect(raise(a.id, a.lineId, 1)).rejects.toThrow(/cancelled/);
    });

    it("cancel refuses without a reason", async () => {
      const c = await issue(1);
      await expect(
        prisma.$transaction((tx) => cancelIssue(tx, { issueId: c.id, userId, reason: "  ", now: now() })),
      ).rejects.toThrow(/reason/);
      await prisma.$transaction((tx) => cancelIssue(tx, { issueId: c.id, userId, reason: "tidy up", now: now() }));
    });
  });

  describe("pending returns", () => {
    let b: { id: string; issueNo: string; lineId: string };
    let first: string;
    let second: string;

    it("cancel refuses while a return is pending, and leaves the issue standing", async () => {
      b = await issue(10);
      first = (await raise(b.id, b.lineId, 4)).id;
      const before = await ledgerCount();

      await expect(
        prisma.$transaction((tx) => cancelIssue(tx, { issueId: b.id, userId, reason: "no", now: now() })),
      ).rejects.toThrow(/awaiting a decision/);

      expect(await ledgerCount()).toBe(before);
      const still = await prisma.materialIssue.findUniqueOrThrow({ where: { id: b.id } });
      expect(still.cancelledAt).toBeNull();
    });

    it("two pending returns cannot together exceed the issued quantity", async () => {
      await expect(raise(b.id, b.lineId, 7)).rejects.toThrow(/Only 6/);
      second = (await raise(b.id, b.lineId, 6)).id;
      await expect(raise(b.id, b.lineId, 0.001)).rejects.toThrow(/Nothing more/);
    });

    it("two returns raised at the same moment cannot over-return", async () => {
      const c = await issue(3);
      const results = await Promise.allSettled([raise(c.id, c.lineId, 2), raise(c.id, c.lineId, 2)]);
      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      const pending = await prisma.materialReturnItem.aggregate({
        where: { issueItemId: c.lineId, materialReturn: { status: "PENDING" } },
        _sum: { quantity: true },
      });
      expect(n(pending._sum.quantity)).toBe(2);
    });

    it("a concurrent approve and reject: only one wins, and stock moves at most once", async () => {
      const before = await balance();
      const results = await Promise.allSettled([
        prisma.$transaction((tx) => approveReturn(tx, { returnId: first, userId, now: now() })),
        prisma.$transaction((tx) => rejectReturn(tx, { returnId: first, userId, note: "Not needed", now: now() })),
      ]);
      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);

      const ret = await prisma.materialReturn.findUniqueOrThrow({ where: { id: first } });
      const moved = await prisma.stockLedger.count({ where: { refId: first } });
      const line = await prisma.materialIssueItem.findUniqueOrThrow({ where: { id: b.lineId } });

      if (ret.status === "APPROVED") {
        expect(moved).toBe(1);
        expect((await balance()).quantity).toBe(before.quantity + 4);
        expect(n(line.returnedQty)).toBe(4);
      } else {
        expect(ret.status).toBe("REJECTED");
        expect(moved).toBe(0);
        expect((await balance()).quantity).toBe(before.quantity);
        expect(n(line.returnedQty)).toBe(0);
      }
    });

    it("a decided return cannot be decided again", async () => {
      await expect(
        prisma.$transaction((tx) => approveReturn(tx, { returnId: first, userId, now: now() })),
      ).rejects.toThrow(/already/);
    });

    it("reject needs a note and moves no stock", async () => {
      const before = await balance();
      const count = await ledgerCount();
      await expect(
        prisma.$transaction((tx) => rejectReturn(tx, { returnId: second, userId, note: " ", now: now() })),
      ).rejects.toThrow(/reason/);

      await prisma.$transaction((tx) => rejectReturn(tx, { returnId: second, userId, note: "Wrong item", now: now() }));
      expect(await balance()).toEqual(before);
      expect(await ledgerCount()).toBe(count);
      const ret = await prisma.materialReturn.findUniqueOrThrow({ where: { id: second } });
      expect(ret.status).toBe("REJECTED");
      expect(ret.decisionNote).toBe("Wrong item");
    });

    it("a pending return is deleted only by its raiser or a holder of delete", async () => {
      const d = await issue(2);
      const id = (await raise(d.id, d.lineId, 1)).id;
      await expect(
        prisma.$transaction((tx) => deletePendingReturn(tx, { returnId: id, userId: otherUserId, canDeleteAny: false })),
      ).rejects.toThrow(/Only the person/);
      await prisma.$transaction((tx) => deletePendingReturn(tx, { returnId: id, userId, canDeleteAny: false }));
      expect(await prisma.materialReturn.findUnique({ where: { id } })).toBeNull();

      await expect(
        prisma.$transaction((tx) => deletePendingReturn(tx, { returnId: second, userId, canDeleteAny: true })),
      ).rejects.toThrow(/can no longer be deleted/);
    });

    it("once decided, cancel puts back only what was not returned", async () => {
      const line = await prisma.materialIssueItem.findUniqueOrThrow({ where: { id: b.lineId } });
      const outstanding = 10 - n(line.returnedQty);
      const before = await balance();
      const result = await prisma.$transaction((tx) =>
        cancelIssue(tx, { issueId: b.id, userId, reason: "Wrap up", now: now() }),
      );
      expect(result.valuePutBack).toBe(outstanding * 540);
      expect((await balance()).quantity).toBe(before.quantity + outstanding);
      expect((await balance()).avgRate).toBe(540);
    });
  });
});
