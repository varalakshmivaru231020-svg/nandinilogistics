"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";

import { prisma } from "@/lib/db";
import { verifyPassword } from "@/lib/auth/password";
import { createSession, destroySession } from "@/lib/auth/session";
import { recordAudit } from "@/lib/audit";

const LoginSchema = z.object({
  email: z.string().trim().min(1, "Email is required").email("Enter a valid email address"),
  password: z.string().min(1, "Password is required"),
  next: z.string().optional(),
});

export type LoginState = { error?: string; fieldErrors?: Record<string, string[]> };

export async function loginAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const parsed = LoginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    next: formData.get("next") ?? undefined,
  });

  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const { email, password, next } = parsed.data;

  const user = await prisma.user.findUnique({
    where: { email: email.toLowerCase() },
    select: {
      id: true,
      email: true,
      name: true,
      passwordHash: true,
      status: true,
      isSuperAdmin: true,
    },
  });

  // Same message either way — never reveal whether the address exists.
  const invalid: LoginState = { error: "Email or password is incorrect." };

  if (!user) {
    await recordAudit({
      action: "LOGIN_FAILED",
      entity: "User",
      summary: `Failed sign-in for unknown address ${email}`,
    });
    return invalid;
  }

  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) {
    await recordAudit({
      action: "LOGIN_FAILED",
      entity: "User",
      entityId: user.id,
      userId: user.id,
      summary: `Failed sign-in for ${user.email}`,
    });
    return invalid;
  }

  if (user.status !== "ACTIVE") {
    return { error: "This account is not active. Contact your administrator." };
  }

  const h = await headers();
  await createSession(user, {
    userAgent: h.get("user-agent") ?? undefined,
    ipAddress: h.get("x-forwarded-for")?.split(",")[0]?.trim(),
  });

  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  await recordAudit({
    action: "LOGIN",
    entity: "User",
    entityId: user.id,
    userId: user.id,
    summary: `${user.name} signed in`,
  });

  redirect(next && next.startsWith("/") ? next : "/dashboard");
}

export async function logoutAction(): Promise<void> {
  await destroySession();
  redirect("/login");
}
