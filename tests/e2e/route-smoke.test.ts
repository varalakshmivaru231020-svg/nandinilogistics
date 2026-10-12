import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { prisma } from "../integration/helpers";
import { revokeTestSessions, sessionFor, serverIsUp, visit } from "./session";

/** This file's own session tag, so a parallel file cannot revoke its cookies. */
const LABEL = "route-smoke";

/**
 * Every page in the app, opened as every seeded role. A page either renders
 * (200), or is refused by the permission model (307 to /forbidden) — anything
 * else, and a 500 in particular, is a screen that does not work.
 *
 * Dynamic segments are skipped here; the flow tests cover those with real ids.
 *
 * A few screens are only reachable from a record and send you back when opened
 * bare — issuing material needs the indent it is issued against. Those are
 * listed below with where they go, so "sends you somewhere sensible" stays
 * asserted rather than merely tolerated.
 */
const REDIRECTS_WHEN_BARE: Record<string, string> = {
  "/material/issues/new": "/material/indents",
};
const APP_DIR = join(__dirname, "..", "..", "src", "app", "(app)");

function routes(dir = APP_DIR, prefix = ""): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (!statSync(full).isDirectory()) continue;
    if (entry.startsWith("[")) continue; // needs a real id
    const segment = entry.startsWith("(") ? "" : `/${entry}`;
    if (readdirSync(full).includes("page.tsx")) found.push(prefix + segment);
    found.push(...routes(full, prefix + segment));
  }
  return [...new Set(found)].sort();
}

const up = await serverIsUp();
const suite = up ? describe : describe.skip;
const ROLES = ["owner", "pm", "supervisor", "store", "sales", "saleshead"];
const tokens: Record<string, string> = {};

suite("every route renders or is refused, for every role", () => {
  beforeAll(async () => {
    for (const role of ROLES) tokens[role] = await sessionFor(`${role}@nninfra.example`, LABEL);
  });

  afterAll(async () => {
    await revokeTestSessions(LABEL);
    await prisma.$disconnect();
  });

  const all = routes();

  it("found the whole route table", () => {
    expect(all.length).toBeGreaterThan(30);
  });

  for (const role of ROLES) {
    it(`serves every route to ${role} without breaking`, async () => {
      const broken: string[] = [];
      for (const route of all) {
        const res = await visit(route, tokens[role]);
        const refused = res.status === 307 && (res.location ?? "").includes("/forbidden");
        const sentBack =
          res.status === 307 &&
          REDIRECTS_WHEN_BARE[route] !== undefined &&
          (res.location ?? "").includes(REDIRECTS_WHEN_BARE[route]);
        if (res.status === 200 || refused || sentBack) continue;
        broken.push(`${route} → ${res.status} ${res.location ?? ""}`);
      }
      expect(broken).toEqual([]);
    }, 120_000);
  }
});
