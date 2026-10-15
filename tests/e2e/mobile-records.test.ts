import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { postStockMovement } from "@/lib/inventory";

import {
  cleanupItemAndStore, demoProject, makeItemAndStore, n, prisma, seededUsers, tag,
} from "../integration/helpers";
import { BASE_URL, serverIsUp } from "./session";

/**
 * The records the material store works from, over real HTTP, against documents
 * raised through the boundary itself.
 *
 * Nothing in the development database has an issue slip, a return or a
 * transfer on it, so each is raised here with the same action the app calls and
 * then read back as a record — which is the only way to prove the two halves
 * fit. Every row is created under a unique tag and removed afterwards.
 *
 * What this is really checking is the shape a decision needs: an issue slip
 * that can be acknowledged by the person holding the phone, a return the store
 * can approve or reject, and a transfer whose receive arrives with every line
 * pre-filled with what was sent.
 */

const up = await serverIsUp();
const suite = up ? describe : describe.skip;
const V1 = `${BASE_URL}/api/mobile/v1`;
const PASSWORD = "Nninfra@2026";

interface Envelope {
  ok: boolean;
  data?: Record<string, never>;
  error?: string;
  code?: string;
}

interface Action {
  key: string;
  label: string;
  action: string;
  args: unknown[];
  remark: string;
  fields?: Array<{
    name: string;
    label: string;
    kind: string;
    fixedRows?: boolean;
    initialRows?: Array<Record<string, unknown>>;
    row?: Array<{ name: string; hidden?: boolean }>;
  }>;
}

interface Rec {
  key: string;
  id: string;
  title: string;
  subtitle: string | null;
  pills: Array<{ label: string; tone: string }>;
  chain?: Array<{ initials: string; state: string }>;
  sections: Array<{ label: string; fields: Array<{ label: string; value: unknown }> }>;
  collections: Array<{ key: string; label: string; rows: Array<Record<string, unknown>> }>;
  actions: Action[];
}

suite("the material records", () => {
  const suffix = tag();
  let token = "";
  let itemId = "";
  let storeId = "";
  let toStoreId = "";
  let projectId = "";
  let supervisorId = "";
  let issueId = "";
  let returnId = "";
  let transferId = "";

  const get = async (path: string) => {
    const res = await fetch(`${V1}${path}`, { headers: { authorization: `Bearer ${token}` } });
    return { status: res.status, body: (await res.json()) as Envelope };
  };

  const act = async (key: string, args: unknown[]) => {
    const res = await fetch(`${V1}/do/${key}`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ args }),
    });
    return { status: res.status, body: (await res.json()) as Envelope };
  };

  const record = async (module: string, id: string) => {
    const { body } = await get(`/record/${module}/${id}`);
    expect(body.ok, body.error).toBe(true);
    return body.data as unknown as Rec;
  };

  beforeAll(async () => {
    const res = await fetch(`${V1}/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: "owner@nninfra.example",
        password: PASSWORD,
        device: "vitest-records",
      }),
    });
    const json = (await res.json()) as Envelope;
    if (!json.ok) throw new Error(`sign-in failed: ${json.error}`);
    token = (json.data as unknown as { token: string }).token;

    const [{ item, store }, project, users] = await Promise.all([
      makeItemAndStore(suffix, 450),
      demoProject(),
      seededUsers(),
    ]);
    itemId = item.id;
    storeId = store.id;
    projectId = project.id;
    supervisorId = users.supervisor.id;

    const second = await prisma.store.create({
      data: { code: `TSTST2-${suffix}`, name: `Test store two ${suffix}` },
    });
    toStoreId = second.id;

    // Stock to issue and to move, put in by the one function that may.
    await prisma.$transaction((tx) =>
      postStockMovement(tx, {
        itemId,
        storeId,
        projectId,
        txnType: "GRN_IN",
        quantity: 200,
        rate: 450,
        refType: "TEST",
        refId: `seed-${suffix}`,
        refNo: `SEED/${suffix}`,
      }),
    );
  });

  afterAll(async () => {
    await prisma.materialReturnItem.deleteMany({ where: { materialReturn: { issueId } } });
    await prisma.materialReturn.deleteMany({ where: { issueId } });
    await prisma.materialIssueItem.deleteMany({ where: { issueId } });
    await prisma.stockLedger.deleteMany({ where: { issueId } });
    await prisma.materialIssue.deleteMany({ where: { id: issueId } });
    await prisma.stockTransferItem.deleteMany({ where: { transferId } });
    await prisma.stockTransfer.deleteMany({ where: { id: transferId } });
    await cleanupItemAndStore(itemId, storeId);
    await prisma.store.delete({ where: { id: toStoreId } }).catch(() => undefined);
    await prisma.session.deleteMany({ where: { userAgent: "Mobile · vitest-records" } });
    await prisma.$disconnect();
  });

  describe("an issue slip", () => {
    it("is raised through the boundary", async () => {
      const { body } = await act("material/issues/createIssue", [
        {
          projectId,
          storeId,
          issuedToId: supervisorId,
          purpose: `Slab work ${suffix}`,
          items: [{ itemId, issuedQty: 50 }],
        },
      ]);
      expect(body.ok, body.error).toBe(true);
      issueId = (body.data as unknown as { id: string }).id;
    });

    it("reads back with its lines and what is still out", async () => {
      const rec = await record("material/issues", issueId);

      expect(rec.pills.map((p) => p.label)).toContain("Awaiting acknowledgement");
      const lines = rec.collections.find((c) => c.key.startsWith("lines:"))!;
      expect(lines.rows).toHaveLength(1);
      expect(lines.rows[0].trailing).toContain("50");
      // Everything issued is still returnable, and the row says so.
      expect(JSON.stringify(lines.rows[0].pills)).toContain("returnable");
    });

    /*
     * The web points at the phone for this one — "Only <name> can acknowledge
     * this slip — on the mobile app, at site" — and it could not be done,
     * because the app had no screen for a slip. The action lets the recipient
     * do it, and a super administrator on their behalf, so the sheet says
     * whose receipt is being confirmed.
     */
    it("can be acknowledged, and says on whose behalf", async () => {
      const rec = await record("material/issues", issueId);
      const ack = rec.actions.find((a) => a.key === "acknowledge")!;
      expect(ack, "the slip can be acknowledged").toBeDefined();
      expect(ack.label).toBe("Acknowledge receipt");
      // Issued to the supervisor, confirmed by the Owner — the sheet says so.
      expect(String((ack as unknown as { confirm: string }).confirm)).toContain("on behalf");

      const done = await act(ack.action, ack.args);
      expect(done.body.ok, done.body.error).toBe(true);

      const after = await record("material/issues", issueId);
      expect(after.pills.map((p) => p.label)).toContain("Acknowledged");
      expect(after.actions.map((a) => a.key)).not.toContain("acknowledge");
      // And it cannot be acknowledged twice.
      const again = await act("material/issues/acknowledgeIssue", [issueId]);
      expect(again.body.ok).toBe(false);
      expect(again.body.error).toContain("already acknowledged");
    });

    it("offers a return with every returnable line pre-filled", async () => {
      const rec = await record("material/issues", issueId);
      const raise = rec.actions.find((a) => a.key === "raiseReturn");
      expect(raise, "the slip offers a return").toBeDefined();

      // One object argument, with the reason and lines filled in from fields.
      expect(raise!.args).toHaveLength(1);
      const lines = raise!.fields!.find((f) => f.name === "lines")!;
      expect(lines.kind).toBe("rows");
      // The slip's own lines — none may be invented or dropped.
      expect(lines.fixedRows).toBe(true);
      expect(lines.initialRows).toHaveLength(1);
      expect(lines.initialRows![0].quantity).toBe(50);
      expect(String(lines.initialRows![0]._label)).toContain("returnable");
      // The line's id is carried, not drawn.
      expect(lines.row!.find((r) => r.name === "issueItemId")!.hidden).toBe(true);
    });
  });

  describe("a return", () => {
    it("is raised with the arguments the record described", async () => {
      const rec = await record("material/issues", issueId);
      const raise = rec.actions.find((a) => a.key === "raiseReturn")!;
      const lines = raise.fields!.find((f) => f.name === "lines")!;

      // Exactly what the client sends: the placeholders filled in.
      const { body } = await act(raise.action, [
        {
          issueId,
          reason: `Surplus after the pour ${suffix}`,
          lines: lines.initialRows!.map((r) => ({
            issueItemId: r.issueItemId,
            quantity: 20,
            condition: "Damaged",
            remarks: "Bag torn",
          })),
        },
      ]);
      expect(body.ok, body.error).toBe(true);
      returnId = (body.data as unknown as { id: string }).id;
    });

    it("waits for the store, and offers both decisions", async () => {
      const rec = await record("material/returns", returnId);

      expect(rec.pills.map((p) => p.label)).toContain("PENDING");
      expect(rec.pills.map((p) => p.label)).toContain("1 damaged");
      expect(rec.actions.map((a) => a.key)).toEqual(["approve", "reject", "delete"]);

      // Rejecting needs a note; approving does not.
      const reject = rec.actions.find((a) => a.key === "reject")!;
      expect(reject.fields![0].name).toBe("note");
      const lines = rec.collections.find((c) => c.key.startsWith("lines:"))!;
      expect(JSON.stringify(lines.rows[0].pills)).toContain("Damaged");
    });

    it("approving it puts the quantity back at the issue rate", async () => {
      const rec = await record("material/returns", returnId);
      const approve = rec.actions.find((a) => a.key === "approve")!;
      const before = await prisma.stockBalance.findUniqueOrThrow({
        where: { itemId_storeId: { itemId, storeId } },
      });

      const { body } = await act(approve.action, [returnId, "Checked in by the store"]);
      expect(body.ok, body.error).toBe(true);

      const after = await prisma.stockBalance.findUniqueOrThrow({
        where: { itemId_storeId: { itemId, storeId } },
      });
      expect(n(after.quantity) - n(before.quantity)).toBeCloseTo(20, 3);

      // And the record now says what happened, with nothing left to decide.
      const settled = await record("material/returns", returnId);
      expect(settled.pills.map((p) => p.label)).toContain("APPROVED");
      expect(settled.actions).toHaveLength(0);
      expect(JSON.stringify(settled.sections)).toContain("back in");
    });
  });

  describe("a transfer between stores", () => {
    it("is raised, approved and received, each from its own record", async () => {
      const made = await act("material/transfers/createTransfer", [
        {
          fromStoreId: storeId,
          toStoreId,
          remarks: `Shifting to the second store ${suffix}`,
          items: [{ itemId, quantity: 30 }],
        },
      ]);
      expect(made.body.ok, made.body.error).toBe(true);
      transferId = (made.body.data as unknown as { id: string }).id;

      const draft = await record("material/transfers", transferId);
      expect(draft.pills[0].label).toBe("DRAFT");
      expect(draft.chain!.map((c) => c.state)).toEqual(["done", "current", "pending"]);
      const approve = draft.actions.find((a) => a.key === "approve")!;
      expect(approve.label).toBe("Approve & send");

      const sent = await act(approve.action, [transferId]);
      expect(sent.body.ok, sent.body.error).toBe(true);

      const transit = await record("material/transfers", transferId);
      expect(transit.pills[0].label).toBe("IN TRANSIT");
      const receive = transit.actions.find((a) => a.key === "receive")!;
      const rows = receive.fields!.find((f) => f.name === "received")!;

      // Every line, pre-filled with what left the store.
      expect(rows.fixedRows).toBe(true);
      expect(rows.initialRows).toHaveLength(1);
      expect(rows.initialRows![0].receivedQty).toBe(30);

      // Received two short, which the transfer records rather than refuses.
      const got = await act(receive.action, [
        transferId,
        rows.initialRows!.map((r) => ({ lineId: r.lineId, receivedQty: 28 })),
      ]);
      expect(got.body.ok, got.body.error).toBe(true);

      const done = await record("material/transfers", transferId);
      expect(done.pills.map((p) => p.label)).toContain("RECEIVED");
      expect(done.pills.map((p) => p.label).join(" ")).toContain("short");
      expect(done.actions).toHaveLength(0);
      const line = done.collections[0].rows[0];
      expect(JSON.stringify(line.pills)).toContain("Short");
    });
  });

  describe("the forms a list offers", () => {
    it("are only the ones this person may open", async () => {
      const { body } = await get("/screen/material/vendors");
      const screen = body.data as unknown as {
        forms: Array<{ key: string; title: string; submitLabel: string }>;
        record: boolean;
      };
      expect(screen.record, "a vendor row opens its record").toBe(true);
      expect(screen.forms.map((f) => f.key)).toContain("material/vendors:create");
    });

    /** The sheet is the workforce, pre-filled with whatever is marked today. */
    it("the attendance sheet arrives as one line per worker", async () => {
      const { body } = await get("/form/hr/attendance/mark");
      const form = body.data as unknown as {
        title: string;
        submitLabel: string;
        fields: Array<{
          name: string;
          kind: string;
          fixedRows?: boolean;
          initialRows?: Array<Record<string, unknown>>;
          row?: Array<{ name: string; options?: Array<{ value: string }> }>;
        }>;
      };

      expect(form.title).toBe("Mark Attendance");
      expect(form.submitLabel).toBe("Save attendance");
      const sheet = form.fields.find((f) => f.name === "marks")!;
      expect(sheet.kind).toBe("rows");
      expect(sheet.fixedRows).toBe(true);
      expect(sheet.initialRows!.length).toBeGreaterThan(0);
      expect(sheet.initialRows![0].status).toBeTruthy();
      // The web's own three marks.
      const status = sheet.row!.find((r) => r.name === "status")!;
      expect(status.options!.map((o) => o.value)).toEqual(["PRESENT", "ABSENT", "HALF_DAY"]);
    });
  });

  /*
   * An edit form is the dangerous kind: it posts a whole `FormData`, so a
   * field it does not send is a field it clears. These prove the form comes
   * back holding what the record holds, and that submitting one change leaves
   * everything else alone — including a multi-select, which is the one that
   * would quietly empty.
   */
  describe("an edit form", () => {
    let vendorId = "";
    let categoryIds: string[] = [];

    beforeAll(async () => {
      const vendor = await prisma.vendor.findFirstOrThrow({ where: { status: "ACTIVE" } });
      vendorId = vendor.id;
      const categories = await prisma.itemCategory.findMany({ take: 2, select: { id: true } });
      categoryIds = categories.map((c) => c.id);
      // Two supply categories, so the round-trip has something to lose.
      await prisma.vendorCategory.createMany({
        data: categoryIds.map((itemCategoryId) => ({ vendorId, itemCategoryId })),
        skipDuplicates: true,
      });
    });

    afterAll(async () => {
      await prisma.vendorCategory.deleteMany({
        where: { vendorId, itemCategoryId: { in: categoryIds } },
      });
    });

    it("comes back holding what the record holds", async () => {
      const { body } = await get(`/form/material/vendors/edit?id=${vendorId}`);
      expect(body.ok, body.error).toBe(true);
      const form = body.data as unknown as {
        title: string;
        submitLabel: string;
        fields: Array<{ name: string; initial?: unknown; locked?: boolean }>;
      };

      expect(form.title).toBe("Edit vendor");
      expect(form.submitLabel).toBe("Save vendor");
      const byName = new Map(form.fields.map((f) => [f.name, f]));
      const vendor = await prisma.vendor.findUniqueOrThrow({ where: { id: vendorId } });
      expect(byName.get("name")!.initial).toBe(vendor.name);
      // A multi-select arrives as the ids it holds, comma separated.
      const held = String(byName.get("categoryIds")!.initial ?? "").split(",").filter(Boolean);
      expect(held.sort()).toEqual([...categoryIds].sort());
    });

    it("changing one field leaves the rest alone", async () => {
      const { body } = await get(`/form/material/vendors/edit?id=${vendorId}`);
      const form = body.data as unknown as {
        action: string;
        fields: Array<{ name: string; kind: string; initial?: unknown }>;
      };

      // Exactly what the client sends: everything it is holding, one changed.
      const payload: Record<string, unknown> = {};
      for (const f of form.fields) {
        if (f.initial === undefined || f.initial === "") continue;
        payload[f.name] =
          f.kind === "multi"
            ? String(f.initial).split(",").filter(Boolean)
            : f.initial;
      }
      payload.contactPerson = `Checked ${suffix}`;

      const sent = await act(form.action, [vendorId, payload]);
      expect(sent.body.ok, sent.body.error).toBe(true);

      const after = await prisma.vendor.findUniqueOrThrow({
        where: { id: vendorId },
        include: { categories: { select: { itemCategoryId: true } } },
      });
      expect(after.contactPerson).toBe(`Checked ${suffix}`);
      // The things nobody touched are still there.
      expect(after.gstin).toBeTruthy();
      expect(after.categories.map((c) => c.itemCategoryId).sort()).toEqual(
        [...categoryIds].sort(),
      );
    });

    /** A booked lead's name and phone are fixed, so the form says so. */
    it("locks what the record will not let go of", async () => {
      const booked = await prisma.lead.findFirst({
        where: { bookings: { some: {} } },
        select: { id: true },
      });
      if (!booked) return;

      const { body } = await get(`/form/sales/leads/edit?id=${booked.id}`);
      expect(body.ok, body.error).toBe(true);
      const fields = (body.data as unknown as { fields: Array<{ name: string; locked?: boolean }> })
        .fields;
      const locked = fields.filter((f) => f.locked).map((f) => f.name);
      expect(locked).toContain("name");
      expect(locked).toContain("phone");
    });

    it("refuses a record it is not open on, and says which", async () => {
      const missing = await get("/form/material/vendors/edit");
      expect(missing.status).toBe(404);
      expect(missing.body.code).toBe("not-found");
    });
  });

  describe("a purchase order and its receipt", () => {
    it("carries the lines, the trail and the stale guard", async () => {
      const list = await get("/list/material/purchase-orders");
      const rows = (list.body.data as unknown as { rows: Array<{ id: string }> }).rows;
      if (rows.length === 0) return;

      const rec = await record("material/purchase-orders", rows[0].id);
      expect(rec.chain!.map((c) => c.initials)).toEqual(["R", "PM", "AD"]);
      expect(rec.collections.map((c) => c.key.split(":")[0])).toEqual([
        "lines", "grns", "invoices",
      ]);
      /*
       * Every write **to the order** carries its own updatedAt, so a decision
       * cannot land on a document the decider never saw. Receiving against it
       * creates a goods receipt rather than changing the order, so it does not
       * — and it is the one action whose arguments are a parsed object.
       */
      const writesToTheOrder = rec.actions.filter(
        // Receiving creates a goods receipt, and an action that opens a form
        // carries no arguments at all until the form is filled in.
        (x) => x.key !== "receive" && x.action !== "",
      );
      expect(writesToTheOrder.length).toBeGreaterThan(0);
      for (const a of writesToTheOrder) {
        expect(
          a.args.some((x) => typeof x === "string" && /^\d{4}-\d{2}-\d{2}T/.test(x)),
          `${a.key} carries the stale guard`,
        ).toBe(true);
      }
    });

    /*
     * Receiving at the gate: the order's own record offers it, with each line
     * pre-filled with the balance still to come and the rate it was ordered
     * at. The store keeper reduces what did not arrive.
     */
    it("offers receiving with the balance still to come pre-filled", async () => {
      const list = await get("/list/material/purchase-orders");
      const rows = (list.body.data as unknown as { rows: Array<{ id: string }> }).rows;
      if (rows.length === 0) return;

      for (const row of rows) {
        const rec = await record("material/purchase-orders", row.id);
        const receive = rec.actions.find((a) => a.key === "receive");
        if (!receive) continue;

        const lines = receive.fields!.find((f) => f.name === "items")!;
        expect(lines.kind).toBe("rows");
        expect(lines.fixedRows).toBe(true);
        expect(lines.initialRows!.length).toBeGreaterThan(0);
        const first = lines.initialRows![0];
        // Received and accepted both start at the balance; the rate and the
        // line's id ride along without being drawn.
        expect(first.receivedQty).toBe(first.acceptedQty);
        expect(first.rate).toBeTypeOf("number");
        expect(String(first._label)).toContain("still to come");
        expect(lines.row!.find((r) => r.name === "poItemId")!.hidden).toBe(true);
        return;
      }
    });

    it("a goods receipt says what the three-way match says", async () => {
      const list = await get("/list/material/grn");
      const rows = (list.body.data as unknown as { rows: Array<{ id: string }> }).rows;
      if (rows.length === 0) return;

      const rec = await record("material/grn", rows[0].id);
      const lines = rec.collections.find((c) => c.key.startsWith("lines:"))!;
      expect(lines.label).toContain("Ordered vs received");
      // The match line is the web's own words, from the web's own helper.
      expect(rec.pills.map((p) => p.label).join(" ")).toMatch(
        /Not posted|Mismatch|Part receipt|matched|Awaiting invoice/,
      );
    });
  });
});
