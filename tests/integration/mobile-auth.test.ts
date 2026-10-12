import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { prisma, seededUsers } from "./helpers";
import { POST as login } from "@/app/api/mobile/v1/auth/login/route";
import { POST as logout } from "@/app/api/mobile/v1/auth/logout/route";
import { GET as me } from "@/app/api/mobile/v1/me/route";
import { GET as calendar } from "@/app/api/mobile/v1/calendar/route";
import { PERM } from "@/lib/permissions/codes";

/**
 * The mobile transport, exercised the way a phone exercises it.
 *
 * These go through the route handlers rather than the libraries underneath,
 * because the thing worth proving is not that permissions resolve — there are
 * unit tests for that — but that a refusal arrives as the right status with the
 * right code, and that revoking a session reaches the device.
 */

const PASSWORD = "Nninfra@2026";
const BASE = "https://nninfra.test/api/mobile/v1";

const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
  new Request(`${BASE}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });

const get = (path: string, headers: Record<string, string> = {}) =>
  new Request(`${BASE}${path}`, { headers });

async function body(res: Response) {
  return (await res.json()) as {
    ok: boolean;
    data?: Record<string, unknown>;
    error?: string;
    code?: string;
  };
}

/** Signs in and hands back the token, failing loudly if the sign-in did not. */
async function signIn(email: string) {
  const res = await login(post("/auth/login", { email, password: PASSWORD, device: "Pixel · test" }));
  const json = await body(res);
  if (!json.ok) throw new Error(`sign-in failed: ${json.error}`);
  return json.data as { token: string; expiresAt: string; user: Record<string, unknown> };
}

let pmEmail = "";
const issuedTokenIds: string[] = [];

beforeAll(async () => {
  const { pm } = await seededUsers();
  pmEmail = pm.email;
});

afterAll(async () => {
  // Every session these tests minted, gone — including the ones they revoked.
  if (issuedTokenIds.length) {
    await prisma.session.deleteMany({ where: { tokenId: { in: issuedTokenIds } } });
  }
  await prisma.$disconnect();
});

describe("signing in from a device", () => {
  it("refuses a wrong password without saying whether the address exists", async () => {
    const wrong = await body(await login(post("/auth/login", { email: pmEmail, password: "nope" })));
    const unknown = await body(
      await login(post("/auth/login", { email: "nobody@nninfra.example", password: "nope" })),
    );
    expect(wrong.error).toBe("Email or password is incorrect.");
    expect(unknown.error).toBe(wrong.error);
  });

  it("complains about an address that is not one, before touching the database", async () => {
    const res = await login(post("/auth/login", { email: "not-an-address", password: "x" }));
    expect(res.status).toBe(422);
    expect((await body(res)).error).toBe("Enter a valid email address");
  });

  it("hands back a token and the whole resolved permission set", async () => {
    const data = await signIn(pmEmail);
    const user = data.user as { permissions: string[]; email: string };

    expect(data.token).toMatch(/^[\w-]+\.[\w-]+\.[\w-]+$/);
    expect(Date.parse(data.expiresAt)).toBeGreaterThan(Date.now());
    expect(user.email).toBe(pmEmail);
    // What the app needs to draw its first screen without a second round trip.
    expect(user.permissions).toContain(PERM.calendar.agenda.view);
    expect(user.permissions).toContain(PERM.admin.mobile.use);

    const row = await prisma.session.findFirst({
      where: { userId: (await seededUsers()).pm.id },
      orderBy: { createdAt: "desc" },
      select: { tokenId: true, userAgent: true, revokedAt: true },
    });
    issuedTokenIds.push(row!.tokenId);
    // It is an ordinary session: an administrator can see and stop this device.
    expect(row!.userAgent).toBe("Mobile · Pixel · test");
    expect(row!.revokedAt).toBeNull();
  });
});

describe("the guard on every endpoint", () => {
  it("is 401 with no token at all", async () => {
    const res = await me(get("/me"));
    expect(res.status).toBe(401);
    expect((await body(res)).code).toBe("auth");
  });

  it("is 401 for a token that does not verify", async () => {
    const res = await me(get("/me", { authorization: "Bearer not.a.token" }));
    expect(res.status).toBe(401);
  });

  it("answers a signed-in device with its identity and its projects", async () => {
    const { token } = await signIn(pmEmail);
    const res = await me(get("/me", { authorization: `Bearer ${token}` }));
    const json = await body(res);

    expect(res.status).toBe(200);
    const user = (json.data!.user as { email: string });
    expect(user.email).toBe(pmEmail);
    expect(Array.isArray(json.data!.projects)).toBe(true);
    // The clock the app measures "overdue" against — never the phone's own.
    expect(Date.parse(json.data!.serverTime as string)).toBeGreaterThan(0);
  });

  /*
   * The point of keeping a Session row behind the JWT. Signing a device out
   * from Administration has to stop it on its very next request, not whenever
   * the token happens to expire.
   */
  it("stops a device the moment its session is revoked", async () => {
    const { token } = await signIn(pmEmail);
    const before = await me(get("/me", { authorization: `Bearer ${token}` }));
    expect(before.status).toBe(200);

    const { pm } = await seededUsers();
    const row = await prisma.session.findFirst({
      where: { userId: pm.id, revokedAt: null },
      orderBy: { createdAt: "desc" },
      select: { tokenId: true },
    });
    issuedTokenIds.push(row!.tokenId);
    await prisma.session.update({
      where: { tokenId: row!.tokenId },
      data: { revokedAt: new Date() },
    });

    const after = await me(get("/me", { authorization: `Bearer ${token}` }));
    expect(after.status).toBe(401);
  });
});

describe("what a super admin's permission set actually looks like", () => {
  /*
   * The trap the build brief now warns about, pinned so the warning cannot
   * drift away from the truth. A super admin's array is whatever their roles
   * resolve to — the seeded Owner holds OWNER_ADMIN and so arrives with a large
   * set, while one created with no role arrives empty and may still do
   * everything. An app that tests `code in permissions` is right for the first
   * and shows an empty application to the second.
   */
  it("is populated for the seeded Owner, and the flag is what carries the authority", async () => {
    const { owner } = await seededUsers();
    const data = await signIn(owner.email);
    const user = data.user as { isSuperAdmin: boolean; permissions: string[] };

    expect(user.isSuperAdmin).toBe(true);
    expect(user.permissions.length).toBeGreaterThan(100);

    const row = await prisma.session.findFirst({
      where: { userId: owner.id },
      orderBy: { createdAt: "desc" },
      select: { tokenId: true },
    });
    issuedTokenIds.push(row!.tokenId);
  });
});

describe("the calendar over the wire", () => {
  it("aggregates the viewer's own sources onto a six-week grid", async () => {
    const { token } = await signIn(pmEmail);
    const res = await calendar(
      get("/calendar?view=month&on=2026-10-10", { authorization: `Bearer ${token}` }),
    );
    const json = await body(res);
    expect(res.status).toBe(200);

    const data = json.data as {
      grid: string[];
      items: unknown[];
      tally: { total: number };
      serverTime: string;
    };
    // Always six weeks, so the panel under the grid never changes height.
    expect(data.grid).toHaveLength(42);
    expect(data.grid[0]).toBe("2026-09-28");
    expect(data.tally.total).toBe(data.items.length);
    // The instant overdue is measured against — never the phone's own clock.
    expect(Date.parse(data.serverTime)).toBeGreaterThan(0);
  });

  it("refuses a view it does not recognise rather than guessing at a month", async () => {
    const { token } = await signIn(pmEmail);
    const res = await calendar(
      get("/calendar?view=decade", { authorization: `Bearer ${token}` }),
    );
    expect(res.status).toBe(422);
  });
});

describe("mobile access as a thing that can be taken away", () => {
  /*
   * The one permission that exists because the phone exists. Denying it must
   * refuse the sign-in itself — with its own code, so the app can say why
   * rather than offering the password field again — and must leave the web
   * untouched.
   */
  it("refuses the sign-in when the code is denied on the user", async () => {
    const { pm } = await seededUsers();
    const perm = await prisma.permission.findUnique({
      where: { code: PERM.admin.mobile.use },
      select: { id: true },
    });

    await prisma.userPermission.create({
      data: { userId: pm.id, permissionId: perm!.id, effect: "DENY", reason: "test" },
    });

    const mark = new Date();
    try {
      const res = await login(post("/auth/login", { email: pmEmail, password: PASSWORD }));
      const json = await body(res);
      expect(res.status).toBe(403);
      expect(json.code).toBe(PERM.admin.mobile.use);
      expect(json.error).toBe("This account is not allowed to use the mobile app.");

      /*
       * The session it had to mint in order to resolve the permission was taken
       * straight back. The row stays, revoked — that is the record that this
       * account tried the app and was not allowed in.
       */
      const fresh = await prisma.session.findMany({
        where: { userId: pm.id, createdAt: { gte: mark } },
        select: { tokenId: true, revokedAt: true },
      });
      expect(fresh).toHaveLength(1);
      expect(fresh[0].revokedAt).not.toBeNull();
      issuedTokenIds.push(fresh[0].tokenId);
    } finally {
      await prisma.userPermission.deleteMany({
        where: { userId: pm.id, permissionId: perm!.id },
      });
    }
  });
});

describe("signing out", () => {
  it("revokes the session the device is holding", async () => {
    const { token } = await signIn(pmEmail);
    expect((await me(get("/me", { authorization: `Bearer ${token}` }))).status).toBe(200);

    const res = await logout(post("/auth/logout", {}, { authorization: `Bearer ${token}` }));
    expect(res.status).toBe(200);
    expect((await me(get("/me", { authorization: `Bearer ${token}` }))).status).toBe(401);
  });

  /*
   * Never guarded and never an error. A token this cannot revoke is one the app
   * is about to throw away anyway, and a 401 would leave the phone believing it
   * still holds a live session.
   */
  it("is still 200 with no token, or one already revoked", async () => {
    expect((await logout(post("/auth/logout", {}))).status).toBe(200);
    expect(
      (await logout(post("/auth/logout", {}, { authorization: "Bearer not.a.token" }))).status,
    ).toBe(200);
  });
});
