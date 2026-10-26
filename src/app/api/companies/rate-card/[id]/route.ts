import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { getAuthContext } from "@/lib/rbac/context";
import { get } from "@/lib/storage";
import { PERM } from "@/lib/permissions/codes";

/**
 * Streams a company's rate card — SOW §3.3: "viewable by Admin and assigned
 * TL". Admin is whoever may edit the company; a Team Leader must be assigned
 * to this company, not just any.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const ctx = await getAuthContext();
  if (!ctx) return new NextResponse("Sign-in required.", { status: 401 });
  if (!ctx.has(PERM.masters.company.viewRateCard)) {
    return new NextResponse("You do not have permission to see rate cards.", { status: 403 });
  }

  const company = await prisma.company.findUnique({
    where: { id },
    select: {
      name: true, rateCardKey: true, rateCardFileName: true,
      teamLeaders: { where: { userId: ctx.id }, select: { userId: true } },
    },
  });
  if (!company) return new NextResponse("Company not found.", { status: 404 });

  const admin = ctx.has(PERM.masters.company.update);
  if (!admin && company.teamLeaders.length === 0) {
    return new NextResponse("This company is not assigned to you.", { status: 403 });
  }
  if (!company.rateCardKey) return new NextResponse("No rate card has been uploaded.", { status: 404 });

  let bytes: Buffer;
  try {
    bytes = await get(company.rateCardKey);
  } catch {
    return new NextResponse("The stored file is missing.", { status: 410 });
  }

  const name = company.rateCardFileName ?? "rate-card";
  const ext = name.toLowerCase().split(".").pop() ?? "";
  const mime =
    ext === "pdf" ? "application/pdf"
      : ext === "png" ? "image/png"
        : ext === "webp" ? "image/webp"
          : "image/jpeg";

  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      "Content-Type": mime,
      "Content-Disposition": `inline; filename="${name.replace(/"/g, "")}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
