import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { prisma } from "../integration/helpers";
import { REPORTS } from "@/lib/reports";
import { revokeTestSessions, sessionFor, serverIsUp, visit } from "./session";

/** This file's own session tag, so a parallel file cannot revoke its cookies. */
const LABEL = "detail-smoke";

/**
 * Every detail, edit and new screen, opened with a real id, as every role.
 *
 * `route-smoke` walks the filesystem but skips any segment in brackets. A list
 * screen is one query; a detail screen joins half a dozen relations to render
 * a record, which is where a clause pushed through the wrong relation blows
 * up — and it is invisible to whoever builds it, because Admin can reach
 * everything.
 *
 * A screen either renders (200) or is refused by the permission model. Most
 * refuse with a 307 to /forbidden; a record-scoped screen answers 404 instead,
 * because confirming that a task exists to somebody who may not see it is
 * itself a leak. Those routes are listed in HIDES_EXISTENCE.
 *
 * A 500 is a screen that does not work.
 */
const HIDES_EXISTENCE = new Set(["/tasks/[id]", "/sales/leads/[id]", "/hr/[id]", "/hr/[id]/id-card"]);

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
  "/hr/[id]/id-card": first(() => prisma.employee.findFirst({ where: { onboardingStatus: "ACCEPTED" }, select: { id: true } })),
  "/companies/[id]": first(() => prisma.company.findFirst({ select: { id: true } })),
  "/payouts/imports/[id]": first(() => prisma.payoutImport.findFirst({ select: { id: true } })),
  "/accounts/invoices/[id]": first(() => prisma.clientInvoice.findFirst({ select: { id: true } })),
  "/staff/payslips/[id]": first(() => prisma.payslip.findFirst({ select: { id: true } })),
  "/tasks/[id]": first(() => prisma.task.findFirst({ select: { id: true } })),
  "/sales/leads/[id]": first(() => prisma.lead.findFirst({ select: { id: true } })),
  // Not a database id: a key from the report registry.
  "/reports/[key]": async () => REPORTS[0]?.key ?? null,
  // The Masters & Users module is web-only, but its screens still have to work.
  "/masters/[key]": async () => "companies",
  "/admin/roles/[id]": first(() => prisma.role.findFirst({ select: { id: true } })),
  "/admin/users/[id]": first(() => prisma.user.findFirst({ select: { id: true } })),
};

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
const ROLES: Record<string, string> = {
  admin: "admin@nandini.example",
  tl: "tl@nandini.example",
  telecaller: "telecaller@nandini.example",
  rider: "rider@nandini.example",
};
const tokens: Record<string, string> = {};

suite("every detail screen opens with a real id, for every role", () => {
  const all = dynamicRoutes();
  const resolved: Record<string, string> = {};

  beforeAll(async () => {
    for (const [role, email] of Object.entries(ROLES)) tokens[role] = await sessionFor(email, LABEL);
    for (const route of all) {
      const id = await ID_SOURCE[route]?.();
      if (id) resolved[route] = id;
    }
  });

  afterAll(async () => {
    await revokeTestSessions(LABEL);
    await prisma.$disconnect();
  });

  it("knows where every dynamic route's id comes from", () => {
    const unknown = all.filter((r) => !ID_SOURCE[r]);
    expect(unknown, "add these to ID_SOURCE").toEqual([]);
  });

  for (const role of Object.keys(ROLES)) {
    it(`opens every detail screen as ${role} without breaking`, async () => {
      const broken: string[] = [];
      for (const route of all) {
        const id = resolved[route];
        if (!id) continue; // nothing to open in this data set
        const path = route.replace(/\[[^\]]+\]/, id);
        const res = await visit(path, tokens[role]);
        const refused = res.status === 307 && (res.location ?? "").includes("/forbidden");
        const hidden = res.status === 404 && HIDES_EXISTENCE.has(route);
        if (res.status === 200 || refused || hidden) continue;
        broken.push(`${path} → ${res.status} ${res.location ?? ""}`);
      }
      expect(broken).toEqual([]);
    }, 120_000);
  }
});
