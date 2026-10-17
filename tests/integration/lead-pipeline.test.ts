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

import { GET as leadList } from "@/app/api/sales/leads/export/route";
import { LEAD_PIPELINE } from "@/lib/sales/lead-display";

bindCookieBox(cookieBox);

/**
 * The lead list as a phone reads it: the web's pipeline, one column at a time.
 *
 * The web lays the six columns out side by side and lets a card be dragged
 * between them. A phone cannot draw six columns, so it draws them as tabs and
 * asks for one — the same six, from the same definition, with the counts the
 * board shows on its own headings.
 */
const BASE = "https://nninfra.test/api/sales/leads/export";

async function read(query: string) {
  const res = await leadList(new Request(`${BASE}?format=json&page=1&pageSize=50&${query}`));
  expect(res.status, await res.clone().text()).toBe(200);
  // The list routes answer in the boundary's envelope.
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
  it("sends the web's own six columns as tabs, with counts", async () => {
    await actAs("owner@nninfra.example");
    const all = await read("");

    const tabs = all.screen?.tabs;
    expect(tabs?.param, "the app sends the chosen key back under this name").toBe("pipeline");
    expect(tabs?.options.map((o) => o.key)).toEqual(["all", ...LEAD_PIPELINE.map((c) => c.key)]);
    expect(tabs?.options.map((o) => o.label)).toEqual([
      "All",
      ...LEAD_PIPELINE.map((c) => c.label),
    ]);

    // "All" is the web's list view: every column added up.
    const columns = tabs!.options.filter((o) => o.key !== "all");
    const everything = tabs!.options.find((o) => o.key === "all")!;
    expect(columns.reduce((n, c) => n + c.count, 0)).toBe(everything.count);

    await cleanupActionSessions();
  });

  it("narrows to one column, and keeps the counts of the others", async () => {
    await actAs("owner@nninfra.example");
    const all = await read("");
    const tabs = all.screen!.tabs!.options;

    for (const column of LEAD_PIPELINE) {
      const held = tabs.find((o) => o.key === column.key)!.count;
      const page = await read(`pipeline=${column.key}`);
      expect(page.total, `${column.label} holds ${held}`).toBe(held);
      /*
       * Every row that came back belongs to that column. The stage badge says
       * so in the screen's own words, which is where the two Site Visit stages
       * become the one column they share.
       */
      for (const row of page.screen!.rows) {
        expect(row.status?.label).toBe(column.label);
      }
      /*
       * The counts do not move as you change tab — they are read with the
       * column left out, which is how the board's own headings read.
       */
      expect(page.screen!.tabs!.options).toEqual(tabs);
    }

    await cleanupActionSessions();
  });

  it("carries how late the follow-up is, and a number to ring", async () => {
    await actAs("owner@nninfra.example");
    const page = await read("");

    const rows = page.screen!.rows;
    expect(rows.length).toBeGreaterThan(0);

    // The badge the web draws beside the date, in its own tone.
    const badges = rows.flatMap((r) => (r.chips ?? []).map((c) => c.text));
    const known = ["overdue", "today", "upcoming"];
    expect(
      badges.some((b) => known.includes(b)),
      "no row carries a follow-up badge",
    ).toBe(true);
    for (const row of rows) {
      const badge = (row.chips ?? []).find((c) => known.includes(c.text));
      if (badge?.text === "overdue") expect(badge.tone).toBe("bad");
      if (badge?.text === "today") expect(badge.tone).toBe("warn");
    }

    // Somebody to ring — the owner may see contact details, so every row that
    // has a number carries it.
    expect(rows.some((r) => (r.contact?.phone ?? "").length > 6)).toBe(true);

    await cleanupActionSessions();
  });

  it("sends no number to somebody who may not see one", async () => {
    // A sales executive sees their own leads; whether they may see contact
    // details is a permission of its own, and a masked number cannot be rung.
    await actAs("sales@nninfra.example");
    const page = await read("");
    for (const row of page.screen!.rows) {
      const phone = row.contact?.phone;
      if (phone) expect(phone, "a masked number was sent as dialable").not.toContain("•");
    }
    await cleanupActionSessions();
  });
});
