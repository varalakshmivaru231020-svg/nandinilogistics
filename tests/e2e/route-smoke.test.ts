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
 * Dynamic segments are skipped here; `detail-smoke` covers those with real ids.
 */
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
const ROLES: Record<string, string> = {
  admin: "admin@nandini.example",
  tl: "tl@nandini.example",
  telecaller: "telecaller@nandini.example",
  rider: "rider@nandini.example",
};
const tokens: Record<string, string> = {};

suite("every route renders or is refused, for every role", () => {
  beforeAll(async () => {
    for (const [role, email] of Object.entries(ROLES)) tokens[role] = await sessionFor(email, LABEL);
  });

  afterAll(async () => {
    await revokeTestSessions(LABEL);
    await prisma.$disconnect();
  });

  const all = routes();

  it("found the whole route table", () => {
    expect(all.length).toBeGreaterThan(10);
  });

  for (const role of Object.keys(ROLES)) {
    it(`serves every route to ${role} without breaking`, async () => {
      const broken: string[] = [];
      for (const route of all) {
        const res = await visit(route, tokens[role]);
        const refused = res.status === 307 && (res.location ?? "").includes("/forbidden");
        if (res.status === 200 || refused) continue;
        broken.push(`${route} → ${res.status} ${res.location ?? ""}`);
      }
      expect(broken).toEqual([]);
    }, 120_000);
  }
});
