import { describe, expect, it, vi } from "vitest";

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

vi.mock("next/cache", () => ({ revalidatePath: () => undefined, revalidateTag: () => undefined }));

import { actAs, bindCookieBox, cleanupActionSessions } from "./action-harness";
import { prisma } from "./helpers";

import { GET as leadList } from "@/app/api/sales/leads/export/route";

bindCookieBox(cookieBox);

/**
 * The lead list as a phone reads it: the web's pipeline, one stage at a time.
 *
 * The web lays the stages out side by side as columns. A phone cannot, so it
 * draws them as tabs and asks for one — the same stages, from the same master,
 * with the counts the board shows on its own headings.
 */
const BASE = "https://nninfra.test/api/sales/leads/export";

async function read(query: string) {
  const res = await leadList(new Request(`${BASE}?format=json&page=1&pageSize=50&${query}`));
  expect(res.status, await res.clone().text()).toBe(200);
  const { data } = (await res.json()) as { data: unknown };
  return data as {
    rows: Array<Record<string, unknown>>;
    total: number;
    screen?: {
      rows: Array<{
        id: string;
        status?: { label: string; tone: string };
        chips?: Array<{ text: string; tone: string }>;
        contact?: { phone: string };
      }>;
      tabs?: { param: string; options: Array<{ key: string; label: string; count: number }> };
    };
  };
}

describe("the lead pipeline on a phone", () => {
  it("sends the master's own stages as tabs, with counts", async () => {
    await actAs("admin@nandini.example");
    const stages = await prisma.leadStage.findMany({ where: { status: "ACTIVE" }, orderBy: { sortOrder: "asc" } });
    const all = await read("");

    const tabs = all.screen?.tabs;
    expect(tabs?.param, "the app sends the chosen key back under this name").toBe("stage");
    expect(tabs?.options.map((o) => o.key)).toEqual(["all", ...stages.map((s) => s.id)]);
    expect(tabs?.options.map((o) => o.label)).toEqual(["All", ...stages.map((s) => s.name)]);

    const columns = tabs!.options.filter((o) => o.key !== "all");
    const everything = tabs!.options.find((o) => o.key === "all")!;
    expect(columns.reduce((n, c) => n + c.count, 0)).toBe(everything.count);

    await cleanupActionSessions();
  });

  it("narrows to one stage, and keeps the counts of the others", async () => {
    await actAs("admin@nandini.example");
    const all = await read("");
    const tabs = all.screen!.tabs!.options;

    for (const column of tabs.filter((o) => o.key !== "all")) {
      const page = await read(`stage=${column.key}`);
      expect(page.total, `${column.label} holds ${column.count}`).toBe(column.count);
      for (const row of page.screen!.rows) {
        expect(row.status?.label).toBe(column.label);
      }
      expect(page.screen!.tabs!.options).toEqual(tabs);
    }

    await cleanupActionSessions();
  });

  it("sends no number to somebody who may not see one", async () => {
    await actAs("telecaller@nandini.example");
    const page = await read("");
    for (const row of page.screen!.rows) {
      const phone = row.contact?.phone;
      if (phone) expect(phone, "a masked number was sent as dialable").not.toContain("•");
    }
    await cleanupActionSessions();
  });
});
