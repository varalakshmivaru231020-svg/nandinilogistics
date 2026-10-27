import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const cookieBox = vi.hoisted(() => ({ value: null as string | null }));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      name === "nn_session" && cookieBox.value ? { name, value: cookieBox.value } : undefined,
    set: () => undefined,
    delete: () => undefined,
  }),
  headers: async () => new Headers(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: () => undefined,
  revalidateTag: () => undefined,
}));

import { actAs, bindCookieBox, cleanupActionSessions } from "./action-harness";
import { prisma, seededCompany } from "./helpers";
import { POST as signup } from "@/app/api/mobile/v1/auth/signup/route";
import { POST as pinLogin } from "@/app/api/mobile/v1/auth/pin-login/route";
import { POST as forgotPin } from "@/app/api/mobile/v1/auth/forgot-pin/route";
import { GET as me } from "@/app/api/mobile/v1/me/route";
import { GET as idCard } from "@/app/api/mobile/v1/id-card/route";
import { GET as photo } from "@/app/api/mobile/v1/photo/route";
import { GET as attendanceMe } from "@/app/api/mobile/v1/attendance/me/route";
import {
  decideProfileEditAction, punchInAction, punchOutAction, requestProfileEditAction,
} from "@/app/(app)/hr/actions";
import { remove } from "@/lib/storage";

bindCookieBox(cookieBox);

/**
 * The rider's way through the app, end to end against the real database:
 * sign up, sign in with the PIN, see themselves, punch in and out, see the
 * ID card, and ask for a profile change that an Admin approves.
 */

const BASE = "https://nninfra.test/api/mobile/v1";
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);
const mobile = `9${String(Math.floor(Math.random() * 1e9)).padStart(9, "0")}`;
const PIN = "2468";
const IP = `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.7`;

const json = (path: string, body: unknown) =>
  new Request(`${BASE}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": IP },
    body: JSON.stringify(body),
  });
const get = (path: string, token: string) =>
  new Request(`${BASE}${path}`, { headers: { authorization: `Bearer ${token}` } });

async function body(res: Response) {
  return (await res.json()) as { ok: boolean; data?: Record<string, unknown>; error?: string; code?: string };
}

function signupForm(over: Record<string, string> = {}) {
  const f = new FormData();
  const fields: Record<string, string> = {
    name: "Test Signup Rider",
    mobile: `+91 ${mobile}`,
    address: "12 Test Street, Bengaluru",
    emergencyMobileFamily: "9000000001",
    emergencyMobileFriend: "9000000002",
    aadhaar: "1234 5678 9012",
    pin: PIN,
    device: "Pixel · test",
    ...over,
  };
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  for (const k of ["photo", "doc:Aadhaar front", "doc:Aadhaar back"]) {
    f.set(k, new File([PNG], `${k.replace(/\W/g, "")}.png`, { type: "image/png" }));
  }
  return new Request(`${BASE}/auth/signup`, { method: "POST", headers: { "x-forwarded-for": IP }, body: f });
}

let token = "";
let employeeId = "";
let userId = "";

beforeAll(async () => {
  await seededCompany();
});

afterAll(async () => {
  if (employeeId) {
    const e = await prisma.employee.findUnique({
      where: { id: employeeId },
      select: { photoKey: true, documents: { select: { storageKey: true } } },
    });
    for (const key of [e?.photoKey, ...(e?.documents ?? []).map((d) => d.storageKey)]) {
      if (key) await remove(key).catch(() => undefined);
    }
    await prisma.notification.deleteMany({ where: { entityId: employeeId } });
    await prisma.employee.delete({ where: { id: employeeId } }).catch(() => undefined);
  }
  if (userId) {
    await prisma.notification.deleteMany({ where: { entityId: userId } });
    await prisma.session.deleteMany({ where: { userId } });
    await prisma.user.delete({ where: { id: userId } }).catch(() => undefined);
  }
  await cleanupActionSessions();
  await prisma.$disconnect();
});

describe("a rider through the app", () => {
  it("refuses a sign-up without the mandatory pieces", async () => {
    const res = await signup(signupForm({ pin: "12", aadhaar: "1" }));
    expect(res.status).toBe(422);
    const j = await body(res);
    expect(Object.keys((j as { fieldErrors?: object }).fieldErrors ?? {})).toEqual(expect.arrayContaining(["pin", "aadhaar"]));
  });

  it("signs up, landing signed in as a Draft rider", async () => {
    const company = await seededCompany();
    const res = await signup(signupForm({ companyId: company.id }));
    const j = await body(res);
    expect(res.status, j.error).toBe(201);
    token = String(j.data!.token);
    const user = j.data!.user as { id: string; roles: Array<{ code: string }> };
    userId = user.id;
    expect(user.roles.map((r) => r.code)).toContain("RIDER");

    const e = await prisma.employee.findUniqueOrThrow({
      where: { userId },
      include: { documents: true, companies: true },
    });
    employeeId = e.id;
    expect(e.onboardingStatus).toBe("DRAFT");
    expect(e.mobile).toBe(mobile);
    expect(e.referralCode).toBeTruthy();
    expect(e.photoKey).toBeTruthy();
    expect(e.documents.map((d) => d.kind).sort()).toEqual(["Aadhaar back", "Aadhaar front"]);
    expect(e.companies.map((c) => c.companyId)).toEqual([company.id]);
  });

  it("refuses a second sign-up for the same number", async () => {
    const res = await signup(signupForm());
    expect(res.status).toBe(409);
    expect((await body(res)).code).toBe("exists");
  });

  it("signs in with mobile and PIN, and refuses a wrong PIN generically", async () => {
    const wrong = await pinLogin(json("/auth/pin-login", { mobile, pin: "0000" }));
    expect(wrong.status).toBe(401);
    const unknown = await pinLogin(json("/auth/pin-login", { mobile: "9111111111", pin: "0000" }));
    const [w, u] = [await body(wrong), await body(unknown)];
    expect(w.code).toBe("credentials");
    expect(u.error).toBe(w.error);

    const res = await pinLogin(json("/auth/pin-login", { mobile: `0${mobile}`, pin: PIN, device: "Pixel · test" }));
    const j = await body(res);
    expect(res.status, j.error).toBe(200);
    token = String(j.data!.token);
  });

  it("answers forgot-PIN the same way whether or not the number exists", async () => {
    const a = await body(await forgotPin(json("/auth/forgot-pin", { mobile })));
    const b = await body(await forgotPin(json("/auth/forgot-pin", { mobile: "9111111111" })));
    expect(a.data).toEqual({ message: "Your Team Leader or Admin will reset your PIN." });
    expect(b.data).toEqual(a.data);
    expect(await prisma.notification.count({ where: { kind: "PIN_RESET_REQUESTED", entityId: employeeId } })).toBeGreaterThan(0);
  });

  it("sees themselves on /me, with their photo", async () => {
    const j = await body(await me(get("/me", token)));
    const rider = j.data!.rider as Record<string, unknown>;
    expect(rider.riderId).toMatch(/^NL/);
    expect(rider.onboardingStatus).toBe("DRAFT");
    expect(rider.photoUrl).toBe("/api/mobile/v1/photo");
    const pic = await photo(get("/photo", token));
    expect(pic.status).toBe(200);
    expect(pic.headers.get("content-type")).toBe("image/png");
  });

  it("cannot punch in until onboarding is accepted", async () => {
    cookieBox.value = token;
    const res = await punchInAction(12.97, 77.59);
    expect(res.ok).toBe(false);
  });

  it("punches in once and out once; a short day is a half day", async () => {
    await prisma.employee.update({ where: { id: employeeId }, data: { onboardingStatus: "ACCEPTED", joinedOn: new Date() } });
    cookieBox.value = token;

    expect((await punchInAction(200, 77.59)).ok).toBe(false);
    const inRes = await punchInAction(12.971599, 77.594566);
    expect(inRes.ok, inRes.ok ? "" : inRes.error).toBe(true);
    expect((await punchInAction(12.97, 77.59)).ok).toBe(false);

    const outRes = await punchOutAction(12.98, 77.6);
    expect(outRes.ok && outRes.data.status).toBe("HALF_DAY");

    const row = await prisma.attendanceEntry.findFirstOrThrow({ where: { employeeId } });
    expect(Number(row.punchInLat)).toBeCloseTo(12.971599, 5);
    expect(row.punchOutAt).not.toBeNull();

    const j = await body(await attendanceMe(get("/attendance/me", token)));
    expect((j.data!.today as { state: string }).state).toBe("PUNCHED_OUT");
    expect((j.data!.days as unknown[]).length).toBe(1);
  });

  it("shows the ID card", async () => {
    const j = await body(await idCard(get("/id-card", token)));
    expect(j.ok).toBe(true);
    expect(j.data!.mainCompany).toBe("Nandini Logistics");
    expect(j.data!.emergencyNumber).toBe("9000000001");
    expect((j.data!.companies as string[]).length).toBe(1);
  });

  it("asks for a profile change that an Admin approves", async () => {
    cookieBox.value = token;
    const f = new FormData();
    f.set("address", "34 New Street, Bengaluru");
    f.set("reason", "Moved");
    const req = await requestProfileEditAction(f);
    expect(req.ok, req.ok ? "" : req.error).toBe(true);
    if (!req.ok) return;

    await actAs("admin@nandini.example");
    const decided = await decideProfileEditAction(req.data.id, "APPROVED", "");
    expect(decided.ok, decided.ok ? "" : decided.error).toBe(true);
    const e = await prisma.employee.findUniqueOrThrow({ where: { id: employeeId } });
    expect(e.address).toBe("34 New Street, Bengaluru");
    expect(await prisma.notification.count({ where: { userId, kind: "PROFILE_EDIT_DECIDED" } })).toBe(1);
  });
});
