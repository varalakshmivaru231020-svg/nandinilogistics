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

    /*
     * The six that were unreachable until their export routes existed:
     * Approvals, Tasks, Task Reports, Checklists, Follow-ups and the Knowledge
     * Base. Every module in the web's navigation is now on the phone, and this
     * is the check that each of them answers rather than merely being listed.
     */
    it("serves the six modules that used to have no endpoint", async () => {
      const broken: string[] = [];
      for (const key of [
        "approvals", "tasks", "tasks/reports", "checklists", "sales/follow-ups", "kb",
      ]) {
        const { status, body } = await get(`/list/${key}`);

        /*
         * A 403 is a right answer, not a broken one: the signed-in Project
         * Manager may not see follow-ups, and the boundary says so with the
         * code. What must never happen is a 404 — that would mean the module
         * is not served at all, which is the state these six were in.
         */
        if (status === 403) {
          if (!body.code) broken.push(`${key} → 403 with no code to act on`);
          continue;
        }
        if (status !== 200 || !body.ok) {
          broken.push(`${key} → ${status} ${body.error ?? ""}`);
          continue;
        }
        const d = body.data as unknown as { columns: unknown[]; filters: string };
        if (!Array.isArray(d.columns) || d.columns.length === 0) broken.push(`${key} → no columns`);
        if (typeof d.filters !== "string") broken.push(`${key} → no filter description`);
      }
      expect(broken).toEqual([]);
    });

    /*
     * The ownership rule travels with the list. Without `task.task.viewAll` a
     * person gets the tasks they raised, were given, or were named on — and the
     * list says so, rather than looking like the whole organisation's.
     */
    it("applies the task ownership rule, and says it has", async () => {
      const { body } = await get("/list/tasks");
      const d = body.data as unknown as { filters: string };
      expect(d.filters).toBe("Yours only");
    });

    it("takes the task screen's own filters", async () => {
      const all = await get("/list/tasks");
      const high = await get("/list/tasks?priority=HIGH");
      const a = all.body.data as unknown as { total: number };
      const b = high.body.data as unknown as { total: number; filters: string };
      expect(b.filters).toBe("HIGH priority · Yours only");
      expect(b.total).toBeLessThanOrEqual(a.total);
    });

    /*
     * A draft is somebody's unfinished writing. Without `kb.article.update` the
     * list shows published articles only — and this is the one place a leak
     * would not be obvious from the screen.
     */
    it("hides knowledge base drafts from a reader who may not edit", async () => {
      const { body } = await get("/list/kb");
      const d = body.data as unknown as { filters: string; rows: Array<{ state: string }> };
      if (d.filters.includes("Published only")) {
        expect(d.rows.every((r) => r.state === "Published")).toBe(true);
      }
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

  /*
   * Forms and records: the two shapes the app had no idea of. A list row is a
   * summary, so a detail screen built from one has no checklist and nothing to
   * press; and nothing at all could be created, because a create screen is a
   * set of fields the app never held.
   */
  describe("a form", () => {
    it("is the web's own form, with its dropdowns filled in", async () => {
      const { body } = await get("/form/calendar/create");
      const form = body.data as unknown as {
        title: string;
        description: string;
        submitLabel: string;
        action: string;
        fields: Array<{ name: string; label: string; kind: string; options?: unknown[] }>;
      };

      expect(form.title).toBe("New calendar task");
      expect(form.description).toContain("They accept it before it lands on their calendar.");
      expect(form.action).toBe("calendar/createCalendarTask");
      // The names the action reads, in the order the web asks for them.
      expect(form.fields.map((f) => f.name)).toEqual([
        "title", "allDay", "startAt", "endAt", "projectId", "location",
        "description", "attendeeIds",
      ]);
      // A dropdown arrives filled, scoped to this caller.
      const people = form.fields.find((f) => f.name === "attendeeIds")!;
      expect(people.kind).toBe("multi");
      expect((people.options ?? []).length).toBeGreaterThan(0);
    });

    /** The indent's button follows the permission, as the web's does. */
    it("fits the submit button to what this person may do", async () => {
      const { body } = await get("/form/material/indents/create");
      const form = body.data as unknown as {
        submitLabel: string;
        shape: { kind: string; order: unknown[] };
      };
      const maySubmit = (await signIn("pm@nninfra.example")).user.permissions.includes(
        "material.indent.submit",
      );

      expect(form.submitLabel).toBe(
        maySubmit ? "Raise indent & send for approval" : "Save as draft",
      );
      expect(form.shape.order[1]).toBe(maySubmit);
    });

    it("answers 404 for a form that is not described yet", async () => {
      const { status, body } = await get("/form/admin/users/create");
      expect(status).toBe(404);
      expect(body.code).toBe("unknown-form");
    });

    it("creates through the same action the web calls", async () => {
      const at = new Date(Date.now() + 3 * 86_400_000).toISOString().slice(0, 16);
      const { body } = await act("calendar/createCalendarTask", [
        {
          title: "Boundary test — joinery inspection",
          startAt: `${at}:00+05:30`,
          endAt: `${at}:00+05:30`.replace(/T(\d\d)/, (_, h) => `T${String(Number(h) + 2).padStart(2, "0")}`),
          location: "Tower B · 6th floor",
        },
      ]);
      expect(body.ok, body.error).toBe(true);
      created = (body.data as unknown as { id: string }).id;

      // And it reads back as a record, with the actions its raiser may take.
      const read = await get(`/record/calendar/${created}`);
      const rec = read.body.data as unknown as {
        title: string;
        actions: Array<{ key: string; args: unknown[]; fields?: Array<{ name: string }> }>;
      };
      expect(rec.title).toBe("Boundary test — joinery inspection");
      const keys = rec.actions.map((a) => a.key);
      expect(keys).toContain("complete");
      expect(keys).toContain("cancel");
      // Extending needs a new finish as well as a reason, so it says so.
      const extend = rec.actions.find((a) => a.key === "extend");
      expect(extend?.fields?.[0].name).toBe("newEndAt");
      expect(extend?.args).toContain("$newEndAt");
    });
  });

  describe("a record", () => {
    it("carries the children the decision turns on", async () => {
      const list = await get("/list/tasks");
      const rows = (list.body.data as unknown as { rows: Array<{ id: string }> }).rows;
      expect(rows.length).toBeGreaterThan(0);

      const { body } = await get(`/record/tasks/${rows[0].id}`);
      const rec = body.data as unknown as {
        sections: Array<{ label: string }>;
        collections: Array<{ key: string; label: string }>;
      };
      expect(rec.sections.length).toBeGreaterThan(0);
      // A list row has none of this: the checklist, the comments, the history.
      expect(rec.collections.length).toBeGreaterThan(0);
    });

    /*
     * Masters & Users is web-only by the brief, so there is no record for it
     * and never will be — a plain 404, which the app reads as "not on the
     * phone" rather than as a failure.
     */
    it("answers 404 for a module that has no record, not 500", async () => {
      const { status, body } = await get("/record/admin/users/whatever");
      expect(status).toBe(404);
      expect(body.code).toBe("unknown-record");
    });
  });

  /*
   * Every list, walked. This caught two routes that took the page parameter
   * and ignored it — one of them a single-line call a bulk edit had skipped —
   * which no unit test could see, because the slicing happens in the shared
   * responder and the routes only have to pass the query through.
   */
  describe("every list takes the page it is given", () => {
    it("answers with that page, and no more rows than asked for", async () => {
      const { body } = await get("/lists");
      const lists = body.data!.lists as unknown as string[];

      const ignored: string[] = [];
      for (const key of lists) {
        const res = await get(`/list/${key}?page=1&pageSize=5`);
        if (!res.body.ok) continue; // a refusal or a project it needs
        const data = res.body.data as unknown as {
          rows: unknown[];
          page?: number;
          total: number;
        };
        if (data.page !== 1) ignored.push(`${key}: no page in the answer`);
        if (data.rows.length > 5) ignored.push(`${key}: ${data.rows.length} rows for pageSize=5`);
      }
      expect(ignored, ignored.join("\n")).toEqual([]);
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
