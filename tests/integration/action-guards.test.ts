import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

// Hoisted so the module stub below can read it — this is the only piece of a
// request the actions actually need.
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

import { actAs, actAsNobody, cleanupActionSessions, bindCookieBox } from "./action-harness";
import { prisma, tag } from "./helpers";

import * as masterActions from "@/app/(app)/masters/actions";

bindCookieBox(cookieBox);

/**
 * These call the real server actions. Only `cookies()` is stubbed — permission
 * resolution, approval routing, value ceilings and the database writes are the
 * production code paths.
 */
describe("server actions enforce permissions on the write path", () => {
  const suffix = tag();

  afterAll(async () => {
    await cleanupActionSessions();
    await prisma.$disconnect();
    vi.restoreAllMocks();
  });

  beforeEach(() => actAsNobody());

  describe("an unauthenticated caller", () => {
    it("cannot create a master record", async () => {
      const form = new FormData();
      form.set("code", `X${suffix}`);
      form.set("name", "Should never exist");
      const res = await masterActions.createMasterAction("departments", form);
      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.error).toMatch(/sign-in/i);
    });

    it("writes nothing when refused", async () => {
      const found = await prisma.department.findFirst({ where: { code: `X${suffix}` } });
      expect(found).toBeNull();
    });
  });

  describe("a user without the permission", () => {
    it("is refused, and told which permission is missing", async () => {
      await actAs("telecaller@nandini.example");
      const form = new FormData();
      form.set("code", `V${suffix}`);
      form.set("name", "Blocked stage");
      const res = await masterActions.createMasterAction("lead-stages", form);
      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.code).toBe("masters.leadStage.create");
    });

  });

  describe("a user with the permission", () => {
    it("creates the record and writes an audit row", async () => {
      await actAs("admin@nandini.example");
      const form = new FormData();
      form.set("code", `D${suffix}`);
      form.set("name", `Test department ${suffix}`);
      form.set("description", "");

      const res = await masterActions.createMasterAction("departments", form);
      expect(res.ok).toBe(true);
      if (!res.ok) return;

      const audit = await prisma.auditLog.findFirst({
        where: { entity: "department", entityId: res.data.id, action: "CREATE" },
      });
      expect(audit).not.toBeNull();
      expect(audit?.summary).toContain(`D${suffix}`);

      await prisma.department.delete({ where: { id: res.data.id } });
    });
  });
});

