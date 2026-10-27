import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { getAuthContext } from "@/lib/rbac/context";
import { photoResponse } from "@/lib/hr/photo-response";
import { PERM } from "@/lib/permissions/codes";

/**
 * Streams an employee's photograph.
 *
 * The photo was being uploaded and stored from the day the form existed and
 * there was nothing to read it back with, so it could never appear anywhere.
 *
 * Seeing the employee is enough to see their face — unlike the Aadhaar and PAN
 * scans, which sit behind the identity permission. A photograph on a staff
 * record is there so people recognise each other.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const ctx = await getAuthContext();
  if (!ctx) return new NextResponse("Sign-in required.", { status: 401 });
  if (!ctx.has(PERM.hr.employee.view)) {
    return new NextResponse("You do not have permission to see employee records.", { status: 403 });
  }

  const employee = await prisma.employee.findUnique({
    where: { id },
    select: { photoKey: true },
  });
  return photoResponse(employee?.photoKey);
}
