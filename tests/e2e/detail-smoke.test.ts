import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { prisma, tag } from "../integration/helpers";
import { REPORTS } from "@/lib/reports";
import { revokeTestSessions, sessionFor, serverIsUp, visit } from "./session";

/** This file's own session tag, so a parallel file cannot revoke its cookies. */
const LABEL = "detail-smoke";

/**
 * Every detail, edit and new screen, opened with a real id, as every role.
 *
 * `route-smoke` walks the filesystem but skips any segment in brackets, on the
 * grounds that "the flow tests cover those with real ids". They did not: of the
 * twenty-two dynamic routes in the app, exactly one — a lead — was ever opened
 * by a test.
 *
 * That is the wrong half to leave uncovered. A list screen filters by project
 * through `projectScopeFilter`; a detail screen does that *and* joins half a
 * dozen relations to render a document, which is where a clause pushed through
 * the wrong relation blows up. It is also invisible to whoever builds it: the
 * Owner can reach everything, so the screen works for the only person who has
 * opened it. `/dashboard/performance` 500'd for every role but the Owner for
 * exactly that reason.
 *
 * A screen either renders (200) or is refused by the permission model. Most
 * refuse with a 307 to /forbidden; a record-scoped screen answers 404 instead,
 * because confirming that a task exists to somebody who may not see it is
 * itself a leak. Those routes are listed in HIDES_EXISTENCE — the distinction
 * is asserted rather than tolerated, so a lookup that 404s for everybody still
 * fails.
 *
 * A 500 is a screen that does not work.
 */

/**
 * Routes that answer 404 rather than 307 for someone who may not see the
 * record, to avoid confirming it exists. See the `notFound()` at the end of the
 * guard block in `src/app/(app)/tasks/[id]/page.tsx`.
 */
const HIDES_EXISTENCE = new Set(["/tasks/[id]"]);

type Resolver = () => Promise<string | null>;

const first = (find: () => Promise<{ id: string } | null>): Resolver => async () =>
  (await find())?.id ?? null;

/**
 * Where each dynamic route's id comes from. Hand-written because an id has to
 * come from somewhere — but the test below fails if a new dynamic route appears
 * and is not listed here, so it cannot quietly go untested.
 */
const ID_SOURCE: Record<string, Resolver> = {
  "/hr/[id]": first(() => prisma.employee.findFirst({ select: { id: true } })),
  "/projects/[id]": first(() => prisma.project.findFirst({ select: { id: true } })),
  "/tasks/[id]": first(() => prisma.task.findFirst({ select: { id: true } })),

  "/material/indents/[id]": first(() => prisma.indent.findFirst({ select: { id: true } })),
  "/material/indents/[id]/edit": first(() =>
    prisma.indent.findFirst({ where: { status: "DRAFT" }, select: { id: true } })),
  "/material/purchase-orders/[id]": first(() =>
    prisma.purchaseOrder.findFirst({ select: { id: true } })),
  // Built by buildMissingRows(); the demo data has no draft to edit.
  "/material/purchase-orders/[id]/edit": async () => null,
  "/material/grn/[id]": first(() => prisma.grn.findFirst({ select: { id: true } })),
  "/material/grn/[id]/edit": async () => null,
  "/material/invoices/[id]": first(() => prisma.vendorInvoice.findFirst({ select: { id: true } })),
  "/material/returns/[id]": async () => null,
  "/material/stock/[id]": first(() => prisma.item.findFirst({ select: { id: true } })),
  "/material/stock/[id]/edit": first(() => prisma.item.findFirst({ select: { id: true } })),
  "/material/vendors/[id]": first(() => prisma.vendor.findFirst({ select: { id: true } })),
  "/material/vendors/[id]/edit": first(() => prisma.vendor.findFirst({ select: { id: true } })),

  "/sales/leads/[id]": first(() => prisma.lead.findFirst({ select: { id: true } })),
  "/sales/bookings/[id]": first(() => prisma.booking.findFirst({ select: { id: true } })),
  "/sales/cost-sheets/[id]": first(() => prisma.costSheet.findFirst({ select: { id: true } })),

  // Not a database id: a key from the report registry.
  "/reports/[key]": async () => REPORTS[0]?.key ?? null,

  // The Masters & Users module is web-only, but its screens still have to work.
  "/masters/[key]": async () => "items",
  "/admin/roles/[id]": first(() => prisma.role.findFirst({ select: { id: true } })),
  "/admin/users/[id]": first(() => prisma.user.findFirst({ select: { id: true } })),
};

/*
 * Three screens the demo data cannot reach: it carries no draft purchase order,
 * no draft goods receipt and no material return at all, so nobody — no test, no
 * demo, nobody clicking around — had ever opened them. These rows are built
 * directly rather than through the actions, because the question here is
 * whether the screen renders; `material-chain` already tests the chain that
 * normally produces them.
 */
const suffix = tag();
const made: { pos: string[]; grns: string[]; returns: string[]; issues: string[] } = {
  pos: [], grns: [], returns: [], issues: [],
};

async function buildMissingRows(): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  const [project, vendor, item, store, user, employee] = await Promise.all([
    prisma.project.findFirst({ select: { id: true } }),
    prisma.vendor.findFirst({ select: { id: true } }),
    prisma.item.findFirst({ select: { id: true } }),
    prisma.store.findFirst({ select: { id: true } }),
    prisma.user.findUnique({ where: { email: "store@nninfra.example" }, select: { id: true } }),
    prisma.employee.findFirst({ select: { id: true } }),
  ]);
  if (!project || !vendor || !item || !store || !user) return out;

  const po = await prisma.purchaseOrder.create({
    data: {
      poNo: `PO/SMOKE/${suffix}`,
      projectId: project.id, vendorId: vendor.id, createdById: user.id,
      subTotal: 1000, taxAmount: 180, totalAmount: 1180, status: "DRAFT",
      items: { create: [{ itemId: item.id, orderedQty: 10, rate: 100, taxPct: 18, amount: 1180 }] },
    },
    include: { items: true },
  });
  made.pos.push(po.id);
  out["/material/purchase-orders/[id]/edit"] = po.id;

  const grn = await prisma.grn.create({
    data: {
      grnNo: `GRN/SMOKE/${suffix}`,
      poId: po.id, vendorId: vendor.id, storeId: store.id,
      receivedById: user.id, status: "DRAFT",
      items: {
        create: [{
          poItemId: po.items[0].id, itemId: item.id,
          receivedQty: 5, acceptedQty: 5, rate: 100,
        }],
      },
    },
  });
  made.grns.push(grn.id);
  out["/material/grn/[id]/edit"] = grn.id;

  const issue = await prisma.materialIssue.create({
    data: {
      issueNo: `ISS/SMOKE/${suffix}`,
      projectId: project.id, storeId: store.id,
      issuedToId: employee?.id ?? user.id, issuedById: user.id,
      totalValue: 500,
      items: { create: [{ itemId: item.id, issuedQty: 5, rate: 100, value: 500 }] },
    },
    include: { items: true },
  });
  made.issues.push(issue.id);

  const ret = await prisma.materialReturn.create({
    data: {
      returnNo: `RET/SMOKE/${suffix}`,
      projectId: project.id, storeId: store.id, issueId: issue.id,
      raisedById: user.id, status: "PENDING", totalValue: 200,
      items: {
        create: [{
          issueItemId: issue.items[0].id, itemId: item.id,
          quantity: 2, rate: 100, value: 200,
        }],
      },
    },
  });
  made.returns.push(ret.id);
  out["/material/returns/[id]"] = ret.id;

  return out;
}

async function removeMadeRows() {
  await prisma.materialReturnItem.deleteMany({ where: { returnId: { in: made.returns } } });
  await prisma.materialReturn.deleteMany({ where: { id: { in: made.returns } } });
  await prisma.materialIssueItem.deleteMany({ where: { issueId: { in: made.issues } } });
  await prisma.materialIssue.deleteMany({ where: { id: { in: made.issues } } });
  await prisma.grnItem.deleteMany({ where: { grnId: { in: made.grns } } });
  await prisma.grn.deleteMany({ where: { id: { in: made.grns } } });
  await prisma.purchaseOrderItem.deleteMany({ where: { poId: { in: made.pos } } });
  await prisma.purchaseOrder.deleteMany({ where: { id: { in: made.pos } } });
}

const APP_DIR = join(__dirname, "..", "..", "src", "app", "(app)");

/** Every route with a bracketed segment, as the filesystem has them. */
function dynamicRoutes(dir = APP_DIR, prefix = ""): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (!statSync(full).isDirectory()) continue;
    const segment = entry.startsWith("(") ? "" : `/${entry}`;
    const here = prefix + segment;
    if (readdirSync(full).includes("page.tsx") && here.includes("[")) found.push(here);
    found.push(...dynamicRoutes(full, here));
  }
  return [...new Set(found)].sort();
}

const up = await serverIsUp();
const suite = up ? describe : describe.skip;
const ROLES = ["owner", "pm", "supervisor", "store", "sales", "saleshead"];
const tokens: Record<string, string> = {};

suite("every detail screen opens with a real id, for every role", () => {
  const all = dynamicRoutes();
  const resolved: Record<string, string> = {};

  beforeAll(async () => {
    for (const role of ROLES) tokens[role] = await sessionFor(`${role}@nninfra.example`, LABEL);
    for (const route of all) {
      const id = await ID_SOURCE[route]?.();
      if (id) resolved[route] = id;
    }
    Object.assign(resolved, await buildMissingRows());
  });

  afterAll(async () => {
    await removeMadeRows();
    await revokeTestSessions(LABEL);
    await prisma.$disconnect();
  });

  /*
   * The guard that keeps this file honest. Adding a detail screen without
   * saying where its id comes from leaves it untested, which is how the
   * eighteen screens this file now covers came to be untested in the first
   * place.
   */
  it("knows where every dynamic route's id comes from", () => {
    const unlisted = all.filter((r) => !(r in ID_SOURCE));
    expect(unlisted, "add these to ID_SOURCE").toEqual([]);
    expect(all.length).toBeGreaterThan(20);
  });

  it("found an id for every one of them in the seeded database", () => {
    const empty = all.filter((r) => !resolved[r]);
    expect(empty, "no seed row to open these with — run `pnpm db:seed`").toEqual([]);
  });

  const rendered = new Set<string>();

  for (const role of ROLES) {
    it(`opens or refuses every detail screen for ${role}`, async () => {
      const broken: string[] = [];
      for (const route of all) {
        const id = resolved[route];
        if (!id) continue;
        const path = route.replace(/\[[^\]]+\]/, id);
        const res = await visit(path, tokens[role]);

        if (res.status === 200) { rendered.add(route); continue; }
        if (res.status === 307 && (res.location ?? "").includes("/forbidden")) continue;
        if (res.status === 404 && HIDES_EXISTENCE.has(route)) continue;
        broken.push(`${path} → ${res.status} ${res.location ?? ""}`);
      }
      expect(broken, `screens that neither rendered nor refused for ${role}`).toEqual([]);
    });
  }

  /*
   * Without this, a screen whose lookup is broken passes by refusing everybody.
   * Every one of these has to actually render for at least one of the six.
   */
  it("every detail screen renders for somebody", () => {
    const nobody = all.filter((r) => resolved[r] && !rendered.has(r));
    expect(nobody, "these refused all six roles — a broken lookup looks like this").toEqual([]);
  });
});
