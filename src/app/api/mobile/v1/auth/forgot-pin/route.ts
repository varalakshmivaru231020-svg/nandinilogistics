import { z } from "zod";

import { prisma } from "@/lib/db";
import { recordAudit } from "@/lib/audit";
import { apiFail, apiOk } from "@/lib/api/mobile";
import { readJson, requestIp } from "@/lib/api/mobile-signin";
import { findUserByMobile } from "@/lib/api/mobile-users";
import { createRateLimiter } from "@/lib/api/rate-limit";
import { PERM } from "@/lib/permissions/codes";
import { usersHolding } from "@/lib/rbac/holders";

/**
 * "Forgot PIN". There is no SMS in scope, so the reset is a person's job: the
 * request tells everyone who may set a PIN, and the answer is always the same
 * so it never reveals whether the number has an account.
 */
const Body = z.object({ mobile: z.string().trim().min(1, "Mobile number is required") });

const FORGOT_PIN_MESSAGE = "Your Team Leader or Admin will reset your PIN.";

const limiter = createRateLimiter(5, 60 * 60_000);

export async function POST(req: Request): Promise<Response> {
  const read = await readJson(req);
  if (!read.ok) return read.res;
  const parsed = Body.safeParse(read.body);
  if (!parsed.success) return apiFail(422, parsed.error.issues[0]?.message ?? "That does not look right.");

  const done = () => apiOk({ message: FORGOT_PIN_MESSAGE });
  // Over the limit, the answer is the same and nothing is recorded.
  if (!limiter.take(requestIp(req) ?? "unknown", Date.now())) return done();

  const user = await findUserByMobile(parsed.data.mobile);
  if (!user) {
    await recordAudit({
      action: "UPDATE",
      entity: "User",
      summary: "PIN reset requested for an unknown mobile number",
    });
    return done();
  }

  const employee = await prisma.employee.findUnique({ where: { userId: user.id }, select: { id: true, employeeCode: true } });
  const to = (await usersHolding(prisma, PERM.hr.employee.setPin)).filter((id) => id !== user.id);
  if (to.length) {
    await prisma.notification.createMany({
      data: to.map((userId) => ({
        userId,
        kind: "PIN_RESET_REQUESTED",
        title: `${user.name} forgot their app PIN`,
        body: employee ? `${employee.employeeCode} · set a new PIN from the rider record.` : "Set a new PIN for this login.",
        href: employee ? `/hr/${employee.id}` : null,
        entity: employee ? "Employee" : "User",
        entityId: employee?.id ?? user.id,
      })),
    });
  }
  await recordAudit({
    action: "UPDATE",
    entity: "User",
    entityId: user.id,
    userId: user.id,
    summary: `${user.name} asked for a PIN reset from the app — ${to.length} notified`,
  });
  return done();
}
