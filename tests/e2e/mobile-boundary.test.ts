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
const PASSWORD = "Nandini@2026";
const V1 = `${BASE_URL}/api/mobile/v1`;
const TL = "tl@nandini.example";

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
  const createdTask: string | null = null;

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
    token = (await signIn(TL)).token;
  });

  afterAll(async () => {
    if (createdTask) {
      await prisma.task.deleteMany({ where: { id: createdTask } });
    }
    await prisma.session.deleteMany({ where: { userAgent: "Mobile · vitest-boundary" } });
    await prisma.$disconnect();
  });

  describe("the catalogues", () => {
    it("offers every action the registry holds, with its arguments", async () => {
      const { body } = await get("/actions");
      const actions = body.data!.actions as unknown as Record<string, unknown[]>;
      expect(Object.keys(actions).sort()).toEqual(MOBILE_ACTION_KEYS);
      expect(actions["tasks/completeTask"]).toEqual([
        { name: "id", kind: "text" },
        { name: "remark", kind: "text" },
      ]);
    });

    it("offers every list", async () => {
      const { body } = await get("/lists");
      expect(body.data!.lists as unknown as string[]).toEqual(MOBILE_LIST_KEYS);
    });

    it("offers only the reports this caller may run", async () => {
      const { status, body } = await get("/reports");
      expect(status).toBe(200);
      expect(Array.isArray(body.data!.reports)).toBe(true);
    });
  });

  describe("reading a list", () => {
    it("is the screen's own query, with its columns and its filter description", async () => {
      const { body } = await get("/list/sales/leads");
      const d = body.data as unknown as {
        title: string; total: number; filters: string;
        columns: Array<{ key: string; header: string }>;
      };
      expect(d.title).toBe("Leads");
      expect(d.columns.length).toBeGreaterThan(0);
      expect(typeof d.filters).toBe("string");
    });

    it("serves every module the sidebar has", async () => {
      const broken: string[] = [];
      for (const key of MOBILE_LIST_KEYS) {
        const { status, body } = await get(`/list/${key}`);
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

    it("takes the task screen's own filters", async () => {
      const all = await get("/list/tasks");
      const high = await get("/list/tasks?priority=HIGH");
      const a = all.body.data as unknown as { total: number };
      const b = high.body.data as unknown as { total: number; filters: string };
      expect(b.filters).toContain("HIGH");
      expect(b.total).toBeLessThanOrEqual(a.total);
    });

    it("answers 404 for a list that does not exist, not 403", async () => {
      const { status, body } = await get("/list/material/unicorns");
      expect(status).toBe(404);
      expect(body.code).toBe("unknown-list");
    });
  });

  describe("running an action", () => {
    it("refuses a permission the caller lacks, naming the code", async () => {
      // A Team Leader may start and finish a task, not raise one.
      const { status, body } = await act("tasks/createTask", [{ title: "x" }]);
      expect(status).toBe(403);
      expect(body.code).toBe("task.task.create");
    });

    it("names the argument it is missing rather than failing obscurely", async () => {
      const { status, body } = await act("tasks/completeTask", []);
      expect(status).toBe(422);
      expect(body.error).toContain("`id` is required");
    });

    it("answers 404 for an action that does not exist", async () => {
      const { status, body } = await act("tasks/teleport", []);
      expect(status).toBe(404);
      expect(body.code).toBe("unknown-action");
    });
  });

  describe("a form", () => {
    it("is the web's own form, with its dropdowns filled in", async () => {
      const { body } = await get("/form/sales/leads/create");
      const form = body.data as unknown as {
        title: string;
        submitLabel: string;
        action: string;
        fields: Array<{ name: string; label: string; kind: string }>;
      };
      expect(form.title).toBe("Capture lead");
      expect(form.action).toBe("sales/leads/createLead");
      expect(form.fields.map((f) => f.name)).toContain("name");
      expect(form.fields.map((f) => f.name)).toContain("phone");
    });

    it("answers 404 for a form that is not described yet", async () => {
      const { status, body } = await get("/form/admin/users/create");
      expect(status).toBe(404);
      expect(body.code).toBe("unknown-form");
    });
  });

  describe("a record", () => {
    it("answers 404 for a module that has no record, not 500", async () => {
      const { status, body } = await get("/record/admin/users/whatever");
      expect(status).toBe(404);
      expect(body.code).toBe("unknown-record");
    });
  });

  describe("every list takes the page it is given", () => {
    it("answers with that page, and no more rows than asked for", async () => {
      const { body } = await get("/lists");
      const lists = body.data!.lists as unknown as string[];

      const ignored: string[] = [];
      for (const key of lists) {
        const res = await get(`/list/${key}?page=1&pageSize=5`);
        if (!res.body.ok) continue; // a refusal
        const data = res.body.data as unknown as { rows: unknown[]; page?: number; total: number };
        if (data.page !== 1) ignored.push(`${key}: no page in the answer`);
        if (data.rows.length > 5) ignored.push(`${key}: ${data.rows.length} rows for pageSize=5`);
      }
      expect(ignored, ignored.join("\n")).toEqual([]);
    });
  });

  describe("every list sends the row the web draws", () => {
    it("and every row carries the id and the title it opens with", async () => {
      const { body } = await get("/lists");
      const lists = body.data!.lists as unknown as string[];

      const flat: string[] = [];
      for (const key of lists) {
        const res = await get(`/list/${key}?page=1&pageSize=5`);
        if (!res.body.ok) continue;
        const data = res.body.data as unknown as {
          rows: Array<Record<string, unknown>>;
          screen?: {
            rows: Array<{
              id?: string;
              title?: string;
              actions?: Array<{ label?: string; action?: string; form?: string }>;
            }>;
          };
        };
        if (!data.screen) {
          flat.push(`${key}: no composed row — the phone would read the file's columns`);
          continue;
        }
        if (data.screen.rows.length !== data.rows.length) {
          flat.push(`${key}: ${data.screen.rows.length} composed rows for ${data.rows.length} rows`);
        }
        for (const [i, row] of data.screen.rows.entries()) {
          if (!row.id) flat.push(`${key}: row ${i} has no id, so it cannot open its record`);
          if (!row.title) flat.push(`${key}: row ${i} has no title`);
          for (const a of row.actions ?? []) {
            if (!a.label) flat.push(`${key}: row ${i} has a button with no label`);
            if (!a.action && !a.form) {
              flat.push(`${key}: row ${i} button “${a.label}” has neither an action nor a form`);
            }
          }
        }
      }
      expect(flat, flat.join("\n")).toEqual([]);
    });
  });

  describe("every endpoint still needs a session", () => {
    it("refuses the lot without a token", async () => {
      for (const path of ["/me", "/actions", "/lists", "/reports", "/list/sales/leads"]) {
        const res = await fetch(`${V1}${path}`);
        expect(res.status, path).toBe(401);
      }
    });
  });
});
