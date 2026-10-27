import { randomBytes } from "node:crypto";

import { prisma } from "@/lib/db";
import { recordAudit } from "@/lib/audit";
import { hashPassword } from "@/lib/auth/password";
import { apiFail } from "@/lib/api/mobile";
import { completeMobileSignIn, requestIp } from "@/lib/api/mobile-signin";
import { findUserByMobile } from "@/lib/api/mobile-users";
import { createRateLimiter } from "@/lib/api/rate-limit";
import { saveEmployeeFiles } from "@/lib/hr/employee-files";
import { nextDocumentNumber } from "@/lib/numbering";
import { PERM } from "@/lib/permissions/codes";
import { usersHolding } from "@/lib/rbac/holders";
import { referralCodeFor } from "@/lib/riders/referrals";
import { SIGNUP_FILES, validateSignup } from "@/lib/riders/signup";

/**
 * A rider signing themselves up from the app — SOW §3.6 item 1.
 *
 * Unauthenticated, so it is rate-limited per address. It makes what a
 * tele-caller's onboarding makes — an onboarding *draft* with a Rider ID — plus
 * the PIN login, and answers with a session so the rider lands signed in and
 * sees their Draft status. Acceptance is still a person's decision.
 */

const limiter = createRateLimiter(5, 60 * 60_000);

const TEXT_FIELDS = [
  "referralCode", "mobile", "name", "companyId", "address", "emergencyMobileFamily",
  "emergencyMobileFriend", "aadhaar", "pan", "drivingLicence", "pin", "device",
] as const;

export async function POST(req: Request): Promise<Response> {
  if (!limiter.take(requestIp(req) ?? "unknown", Date.now())) {
    return apiFail(429, "Too many sign-ups from this network. Try again in an hour.", "rate-limit");
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return apiFail(400, "Send the sign-up as multipart form data.");
  }

  const text: Record<string, string> = {};
  for (const k of TEXT_FIELDS) {
    const v = form.get(k);
    text[k] = typeof v === "string" ? v : "";
  }
  const present = new Set(
    Object.keys(SIGNUP_FILES).filter((k) => {
      const f = form.get(k);
      return f instanceof File && f.size > 0;
    }),
  );

  const checked = validateSignup(text, present);
  if (!checked.ok) return apiFail(422, checked.error, undefined, checked.fieldErrors);
  const v = checked.value;
  const device = text.device.trim().slice(0, 120) || undefined;

  if (await findUserByMobile(v.mobile)) {
    return apiFail(409, "An account already exists for this mobile number. Sign in with your PIN.", "exists");
  }

  let referredById: string | null = null;
  if (v.referralCode) {
    const referrer = await prisma.employee.findUnique({ where: { referralCode: v.referralCode }, select: { id: true } });
    if (!referrer) {
      return apiFail(422, "That referral code is not recognised.", undefined, { referralCode: ["That referral code is not recognised."] });
    }
    referredById = referrer.id;
  }
  if (v.companyId) {
    const company = await prisma.company.findFirst({ where: { id: v.companyId, status: "ACTIVE" }, select: { id: true } });
    if (!company) return apiFail(422, "That company is not available.", undefined, { companyId: ["That company is not available."] });
  }

  const riderType = await prisma.employmentType.findFirst({
    where: { name: { equals: "Rider", mode: "insensitive" } },
    select: { id: true },
  });
  const role = await prisma.role.findUnique({ where: { code: "RIDER" }, select: { id: true } });
  if (!riderType || !role) return apiFail(503, "Sign-up is not set up yet. Contact Nandini Logistics.", "not-configured");

  const pinHash = await hashPassword(v.pin);
  // No password: the app signs in with the PIN. A random hash keeps the
  // password route closed without a second column.
  const passwordHash = await hashPassword(randomBytes(24).toString("hex"));

  const { employee, user } = await prisma.$transaction(async (tx) => {
    const employeeCode = await nextDocumentNumber(tx, "RIDER");
    const user = await tx.user.create({
      data: {
        employeeCode,
        name: v.name,
        email: `${employeeCode.toLowerCase()}@riders.nandini.local`,
        phone: v.mobile,
        passwordHash,
        pinHash,
        roles: { create: [{ roleId: role.id }] },
      },
      select: { id: true, email: true, name: true, status: true, isSuperAdmin: true },
    });
    const employee = await tx.employee.create({
      data: {
        employeeCode,
        name: v.name,
        mobile: v.mobile,
        aadhaar: v.aadhaar,
        pan: v.pan,
        address: v.address,
        drivingLicence: v.drivingLicence,
        emergencyMobileFamily: v.emergencyMobileFamily,
        emergencyMobileFriend: v.emergencyMobileFriend,
        employmentTypeId: riderType.id,
        status: "ACTIVE",
        onboardingStatus: "DRAFT",
        referralCode: referralCodeFor(employeeCode),
        referredById,
        userId: user.id,
        companies: v.companyId ? { create: [{ companyId: v.companyId }] } : undefined,
      },
      select: { id: true, employeeCode: true, name: true },
    });
    return { employee, user };
  });

  try {
    await saveEmployeeFiles(employee.id, form, user.id);
  } catch (err) {
    // Nothing half-made is left behind: the rider can simply try again.
    await prisma.employee.delete({ where: { id: employee.id } }).catch(() => undefined);
    await prisma.user.delete({ where: { id: user.id } }).catch(() => undefined);
    return apiFail(422, err instanceof Error ? err.message : "A file could not be stored.");
  }

  const to = await usersHolding(prisma, PERM.hr.employee.acceptOnboarding);
  if (to.length) {
    await prisma.notification.createMany({
      data: to.map((userId) => ({
        userId,
        kind: "RIDER_SIGNED_UP",
        title: `${employee.name} signed up from the app as ${employee.employeeCode}`,
        body: "Onboarding draft — check the KYC and submit it for review.",
        href: `/hr/${employee.id}`,
        entity: "Employee",
        entityId: employee.id,
      })),
    });
  }
  await recordAudit({
    action: "CREATE", entity: "Employee", entityId: employee.id, userId: user.id,
    summary: `${employee.name} signed up from the app as ${employee.employeeCode} — onboarding draft${referredById ? ` (referred by code ${v.referralCode})` : ""}`,
  });

  return completeMobileSignIn(req, user, device, { status: 201, how: "sign-up" });
}
