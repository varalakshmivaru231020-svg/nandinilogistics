// TEMPORARY, local only: signs in the seeded owner so the screens can be
// screenshotted for the design comparison. Deleted after the pass.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { createSession } from "@/lib/auth/session";

export async function GET(request: Request) {
  if (!process.env.SHOT_KEY) return new NextResponse("no", { status: 404 });
  const url = new URL(request.url);
  const to = url.searchParams.get("to") ?? "/dashboard";
  const user = await prisma.user.findUniqueOrThrow({ where: { email: "owner@nninfra.example" } });
  const token = await createSession(user, { userAgent: "design-shot" });
  const res = NextResponse.redirect(new URL(to, url.origin));
  res.cookies.set("nn_session", token, { httpOnly: true, sameSite: "lax", path: "/" });
  return res;
}
