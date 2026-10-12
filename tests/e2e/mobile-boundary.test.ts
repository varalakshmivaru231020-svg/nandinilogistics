import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { prisma } from "../integration/helpers";
import { MOBILE_ACTION_KEYS } from "@/lib/api/mobile-actions";
import { MOBILE_LIST_KEYS } from "@/lib/api/mobile-lists";
import { BASE_URL, serverIsUp } from "./session";

/**
 * The boundary over real HTTP, as the Android client uses it.
 *
 * Not through the handlers: the thing worth proving is that a bearer token
 * reaches a server action written for a cookie, that a list comes back as rows
 * with the screen's own filters applied, and that a refusal arrives with the
 * code the app has to act on. None of that is visible from inside the process.
 */

const up = await serverIsUp();
const suite = up ? describe : describe.skip;
const PASSWORD = "Nninfra@2026";
const V1 = `${BASE_URL}/api/mobile/v1`;

interface Envelope {
  ok: boolean;
  data?: Record<string, never>;
  error?: string;
  code?: string;
}

async function signIn(email: string) {
  const res = await fetch(`${V1}/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password: PASSWORD, device: "vitest-boundary" }),
  });
  const json = (await res.json()) as Envelope;
  if (!json.ok) throw new Error(`sign-in failed: ${json.error}`);
  return json.data as unknown as { token: string; user: { permissions: string[] } };
}

suite("the mobile boundary", () => {
  let token = "";
  let created: string | null = null;

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

  beforeAll(async () => {
    token = (await signIn("pm@nninfra.example")).token;
  });

  afterAll(async () => {
    if (created) {
      await prisma.calendarAttendee.deleteMany({ where: { eventId: created } });
      await prisma.calendarEvent.deleteMany({ where: { id: created } });
    }
    await prisma.session.deleteMany({ where: { userAgent: "Mobile · vitest-boundary" } });
    await prisma.$disconnect();
  });

  describe("the catalogues", () => {
    it("offers every action the registry holds, with its arguments", async () => {
      const { body } = await get("/actions");
      const actions = body.data!.actions as unknown as Record<string, unknown[]>;
      expect(Object.keys(actions).sort()).toEqual(MOBILE_ACTION_KEYS);
      expect(actions["material/indents/approveIndent"]).toEqual([
        { name: "id", kind: "text" },
        { name: "level", kind: "enum", values: ["PM", "ADMIN"] },
        { name: "remarks", kind: "text" },
        { name: "revisions", kind: "json", optional: true },
        { name: "expectedUpdatedAt", kind: "text", optional: true },
      ]);
    });

    it("offers every list", async () => {
      const { body } = await get("/lists");
      expect(body.data!.lists as unknown as string[]).toEqual(MOBILE_LIST_KEYS);
    });

    /*
     * Filtered by permission, so the app's reports screen lists things that
     * work. Sixteen rows of which fourteen answer 403 is not a screen.
     */
    it("offers only the reports this caller may run", async () => {
      const { body } = await get("/reports");
      const keys = (body.data!.reports as unknown as Array<{ key: string }>).map((r) => r.key);
      expect(keys).toContain("indentAgeing");
      expect(keys).not.toContain("leadPerformance");
    });
  });

  describe("reading a list", () => {
    it("is the screen's own query, with its columns and its filter description", async () => {
      const { body } = await get("/list/material/indents");
      const d = body.data as unknown as {
        title: string; total: number; filters: string;
        columns: Array<{ key: string; header: string }>;
      };
      expect(d.title).toBe("Indents");
      expect(d.columns.map((c) => c.header)).toContain("Indent No");
      expect(d.filters).toBe("All indents in view");
      expect(d.total).toBeGreaterThan(0);
    });

    it("takes the same query parameters the web reads from its URL", async () => {
      const all = await get("/list/material/indents");
      const draft = await get("/list/material/indents?status=DRAFT");
      const a = all.body.data as unknown as { total: number };
      const b = draft.body.data as unknown as { total: number; filters: string };
      expect(b.total).toBeLessThan(a.total);
      expect(b.filters).toContain("draft");
    });

    it("answers 404 for a list that does not exist, not 403", async () => {
      const { status, body } = await get("/list/material/unicorns");
      expect(status).toBe(404);
      expect(body.code).toBe("unknown-list");
    });
  });

  describe("running an action", () => {
    /*
     * The one that matters most. A server action resolves its actor through
     * getAuthContext(), which read only the session cookie — so every one of
     * the 152 answered "Sign-in required" to a phone holding a good token,
     * until readSessionToken() learned to read the bearer header too.
     */
    it("reaches a real server action with nothing but a bearer token", async () => {
      const { body } = await act("calendar/createCalendarTask", [{
        title: "Boundary test — slab walk",
        startAt: "2026-10-20T10:00",
        endAt: "2026-10-20T11:00",
      }]);
      expect(body.ok, body.error).toBe(true);
      created = (body.data as unknown as { id: string }).id;
      expect(created).toBeTruthy();
    });

    it("has really written it, and written the audit row with it", async () => {
      const row = await prisma.calendarEvent.findUnique({
        where: { id: created! },
        select: { title: true, createdById: true },
      });
      expect(row?.title).toBe("Boundary test — slab walk");

      const audit = await prisma.auditLog.findFirst({
        where: { entity: "CalendarEvent", entityId: created! },
        select: { action: true },
      });
      expect(audit?.action).toBe("CREATE");
    });

    it("refuses a permission the caller lacks, naming the code", async () => {
      const { status, body } = await act("material/indents/approveIndent", [
        created!, "ADMIN", "nope",
      ]);
      expect(status).toBe(403);
      expect(body.code).toBe("material.indent.approveAdmin");
      expect(body.error).toContain("do not have permission");
    });

    it("names the argument it is missing rather than failing obscurely", async () => {
      const { status, body } = await act("tasks/completeTask", []);
      expect(status).toBe(422);
      expect(body.error).toBe("`id` is required.");
    });

    /* The type that restricts an enum is gone by the time the action runs. */
    it("holds an enum to the values the action declares", async () => {
      const { status, body } = await act("material/indents/approveIndent", [created!, "OWNER", "x"]);
      expect(status).toBe(422);
      expect(body.error).toContain("must be one of: PM, ADMIN");
    });

    it("answers 404 for an action that does not exist", async () => {
      const { status, body } = await act("tasks/teleport", []);
      expect(status).toBe(404);
      expect(body.code).toBe("unknown-action");
    });
  });

  describe("every endpoint still needs a session", () => {
    it("refuses the lot without a token", async () => {
      for (const path of ["/me", "/actions", "/lists", "/reports", "/list/material/indents"]) {
        const res = await fetch(`${V1}${path}`);
        expect(res.status, path).toBe(401);
      }
    });
  });
});
