import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { prisma } from "../integration/helpers";
import { revokeTestSessions, sessionFor, serverIsUp, visit } from "./session";

/**
 * Every print view, over HTTP, against the permissions and project mappings the
 * database actually holds. Nothing here hard-codes who may print what: for each
 * seeded role the expected answer is worked out from that user's roles,
 * overrides and project access, so the test follows the role matrix and fails
 * only when a route disagrees with it.
 *
 * Requires the app running (`pnpm start`), like the rest of the E2E suite.
 */

const up = await serverIsUp();
const suite = up ? describe : describe.skip;

const ROLES = ["owner", "pm", "supervisor", "store", "sales", "saleshead"] as const;
const ACCESS_ALL = "project.project.accessAll";

interface Holding {
  userId: string;
  superAdmin: boolean;
  codes: Set<string>;
  projectIds: Set<string>;
}

/** A real record for a print route: its id, its project, and who raised it where that matters. */
interface Target {
  id: string;
  projectId: string;
  raisedById?: string;
}

interface PrintRoute {
  path: string;
  view: string;
  print: string;
  /** Picks a record from the development database; null when there is none. */
  pick: () => Promise<Target | null>;
  /** Any rule beyond permission and project, e.g. the indent's owner-or-viewAll check. */
  extra?: (h: Holding, t: Target) => boolean;
}

const ROUTES: PrintRoute[] = [
  {
    path: "/print/purchase-orders",
    view: "material.purchaseOrder.view",
    print: "material.purchaseOrder.print",
    pick: async () => prisma.purchaseOrder.findFirst({ orderBy: { createdAt: "asc" }, select: { id: true, projectId: true } }),
  },
  {
    path: "/print/issues",
    view: "material.issue.view",
    print: "material.issue.print",
    pick: async () => prisma.materialIssue.findFirst({ orderBy: { createdAt: "asc" }, select: { id: true, projectId: true } }),
  },
  {
    path: "/print/indents",
    view: "material.indent.view",
    print: "material.indent.print",
    pick: async () =>
      prisma.indent.findFirst({ orderBy: { createdAt: "asc" }, select: { id: true, projectId: true, raisedById: true } }),
    extra: (h, t) => h.superAdmin || t.raisedById === h.userId || h.codes.has("material.indent.viewAll"),
  },
  {
    path: "/print/vendor-payments",
    view: "material.vendorPayment.view",
    print: "material.vendorPayment.print",
    pick: async () => {
      const p = await prisma.vendorPayment.findFirst({
        orderBy: { createdAt: "asc" },
        select: { id: true, invoice: { select: { purchaseOrder: { select: { projectId: true } } } } },
      });
      return p ? { id: p.id, projectId: p.invoice.purchaseOrder.projectId } : null;
    },
  },
  {
    path: "/print/bookings",
    view: "sales.booking.view",
    print: "sales.booking.print",
    pick: async () => prisma.booking.findFirst({ orderBy: { createdAt: "asc" }, select: { id: true, projectId: true } }),
  },
  {
    path: "/print/demands",
    view: "sales.demand.view",
    print: "sales.demand.print",
    pick: async () => {
      const d = await prisma.paymentDemand.findFirst({
        orderBy: { createdAt: "asc" },
        select: { id: true, booking: { select: { projectId: true } } },
      });
      return d ? { id: d.id, projectId: d.booking.projectId } : null;
    },
  },
  {
    path: "/print/cost-sheets",
    view: "sales.costSheet.view",
    print: "sales.costSheet.print",
    pick: async () => {
      const s = await prisma.costSheet.findFirst({
        orderBy: { createdAt: "asc" },
        select: { id: true, unit: { select: { projectId: true } } },
      });
      return s ? { id: s.id, projectId: s.unit.projectId } : null;
    },
  },
];

const tokens: Record<string, string> = {};
const holdings: Record<string, Holding> = {};
const targets: Record<string, Target | null> = {};

/** A seeded user's permissions — role grants, plus ALLOW overrides, minus DENY overrides — and mapped projects. */
async function holdingOf(email: string): Promise<Holding> {
  const user = await prisma.user.findUniqueOrThrow({
    where: { email },
    select: {
      id: true,
      isSuperAdmin: true,
      roles: { select: { role: { select: { status: true, permissions: { select: { permission: { select: { code: true } } } } } } } },
      permissions: { select: { effect: true, permission: { select: { code: true } } } },
      projectAccess: { select: { projectId: true } },
    },
  });
  const codes = new Set<string>();
  for (const ur of user.roles) {
    if (ur.role.status !== "ACTIVE") continue;
    for (const rp of ur.role.permissions) codes.add(rp.permission.code);
  }
  for (const up of user.permissions) if (up.effect === "ALLOW") codes.add(up.permission.code);
  for (const up of user.permissions) if (up.effect === "DENY") codes.delete(up.permission.code);
  return {
    userId: user.id,
    superAdmin: user.isSuperAdmin,
    codes,
    projectIds: new Set(user.projectAccess.map((p) => p.projectId)),
  };
}

function expectedFor(h: Holding, route: PrintRoute, t: Target): "allow" | "forbid" {
  const has = (code: string) => h.superAdmin || h.codes.has(code);
  if (!has(route.view) || !has(route.print)) return "forbid";
  if (!has(ACCESS_ALL) && !h.projectIds.has(t.projectId)) return "forbid";
  if (route.extra && !route.extra(h, t)) return "forbid";
  return "allow";
}

suite("print views, end to end", () => {
  beforeAll(async () => {
    for (const role of ROLES) {
      const email = `${role}@nninfra.example`;
      tokens[role] = await sessionFor(email);
      holdings[role] = await holdingOf(email);
    }
    for (const route of ROUTES) targets[route.path] = await route.pick();
  });

  afterAll(async () => {
    await revokeTestSessions();
    await prisma.$disconnect();
  });

  for (const route of ROUTES) {
    describe(route.path, () => {
      it("asks a signed-out visitor to sign in", async () => {
        const t = targets[route.path];
        if (!t) return; // no such record in this data set
        const res = await visit(`${route.path}/${t.id}`);
        expect(res.status).toBe(307);
        expect(res.location).toContain("/login");
      });

      it("answers an unknown id with 404", async () => {
        const res = await visit(`${route.path}/does-not-exist`, tokens.owner);
        expect(res.status).toBe(404);
      });

      for (const role of ROLES) {
        it(`answers ${role} as the role matrix says`, async () => {
          const t = targets[route.path];
          if (!t) return; // no such record in this data set
          const h = holdings[role];
          const res = await visit(`${route.path}/${t.id}`, tokens[role]);

          if (expectedFor(h, route, t) === "allow") {
            expect(res.status, `${role} holds ${route.view} + ${route.print} and the project`).toBe(200);
            expect(res.html).toContain("data-print");
          } else {
            expect(res.status, `${role} should be refused ${route.path}`).toBe(307);
            expect(res.location).toContain("/forbidden");
          }
        });
      }
    });
  }
});
