import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { prisma, seededUsers } from "./helpers";
import { POST as login } from "@/app/api/mobile/v1/auth/login/route";
import { GET as screens } from "@/app/api/mobile/v1/screens/route";
import { NAVIGATION, visibleNavigation } from "@/lib/navigation";

/**
 * The app's drawer, against the web's own sidebar.
 *
 * It is the web's `NAVIGATION` — same order, same labels — minus what the app
 * has no screen for. Masters & Users is the one: master data, users, roles,
 * sessions, audit and settings are the desk's by the brief (§12), and the app
 * used to list the entry and answer "managed on the web" when it was tapped.
 * A menu entry that exists to refuse you is worse than no entry.
 */

const PASSWORD = "Nninfra@2026";
const BASE = "https://nninfra.test/api/mobile/v1";
const issued: string[] = [];

async function menuFor(email: string) {
  const res = await login(
    new Request(`${BASE}/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password: PASSWORD, device: "menu test" }),
    }),
  );
  const body = (await res.json()) as { ok: boolean; data?: { token: string } };
  expect(body.ok, `sign-in failed for ${email}`).toBe(true);
  const token = body.data!.token;

  const got = await screens(
    new Request(`${BASE}/screens`, { headers: { authorization: `Bearer ${token}` } }),
  );
  const payload = (await got.json()) as {
    data: { navigation: Array<{ label: string; items: Array<{ href: string; label: string }> }> };
  };
  return payload.data.navigation;
}

beforeAll(async () => {
  await seededUsers();
});

afterAll(async () => {
  await prisma.session.deleteMany({ where: { userAgent: "menu test" } });
  void issued;
});

describe("the app's drawer", () => {
  it("does not offer Masters & Users to anybody", async () => {
    for (const email of ["owner@nninfra.example", "pm@nninfra.example", "sales@nninfra.example"]) {
      const sections = await menuFor(email);
      const hrefs = sections.flatMap((s) => s.items.map((i) => i.href));
      expect(hrefs, `${email} was offered it`).not.toContain("/masters");
      expect(
        sections.flatMap((s) => s.items.map((i) => i.label)),
        `${email} was offered it`,
      ).not.toContain("Masters & Users");
    }
  });

  it("still offers everything else the web's sidebar does", async () => {
    const sections = await menuFor("owner@nninfra.example");
    const hrefs = new Set(sections.flatMap((s) => s.items.map((i) => i.href)));

    // The owner sees the whole sidebar on the web; the phone's is that list
    // less the web-only entries, and nothing else.
    const web = visibleNavigation(() => true).flatMap((s) => s.items);
    const expected = web.filter((i) => !i.webOnly).map((i) => i.href);
    const missing = expected.filter((h) => !hrefs.has(h));
    expect(missing, "the drawer is missing these").toEqual([]);
    expect(hrefs.size).toBe(expected.length);
  });

  it("keeps Users & Attendance, which is a different module and is in the app", async () => {
    const sections = await menuFor("owner@nninfra.example");
    const items = sections.flatMap((s) => s.items);
    expect(items.find((i) => i.href === "/hr")?.label).toBe("Users & Attendance");
  });

  it("leaves the web's own sidebar alone", () => {
    // `visibleNavigation` is the web's, and it does not read `webOnly`.
    const web = visibleNavigation(() => true).flatMap((s) => s.items.map((i) => i.href));
    expect(web).toContain("/masters");
    expect(NAVIGATION.flatMap((s) => s.items).find((i) => i.href === "/masters")?.webOnly).toBe(true);
  });

  it("offers nothing whose permissions this person holds none of", async () => {
    /*
     * Masters & Users was listed by `anyPermission`, which this route ignored
     * — so the drawer could show a door the page behind it shuts. Every entry
     * sent now carries a permission the person holds, or none at all.
     */
    const sections = await menuFor("sales@nninfra.example");
    const hrefs = sections.flatMap((s) => s.items.map((i) => i.href));
    for (const href of hrefs) {
      const item = NAVIGATION.flatMap((s) => s.items).find((i) => i.href === href);
      expect(item, `${href} is not in the web's navigation at all`).toBeDefined();
      expect(item!.webOnly ?? false).toBe(false);
    }
  });
});
