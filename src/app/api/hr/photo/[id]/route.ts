import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { getAuthContext } from "@/lib/rbac/context";
import { get } from "@/lib/storage";
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
  if (!employee?.photoKey) return new NextResponse("No photograph on this record.", { status: 404 });

  let bytes: Buffer;
  try {
    bytes = await get(employee.photoKey);
  } catch {
    return new NextResponse("The stored photograph is missing.", { status: 410 });
  }

  const ext = employee.photoKey.split(".").pop()?.toLowerCase();
  const type = ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";

  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      "Content-Type": type,
      "Content-Length": String(bytes.byteLength),
      // A photograph changes rarely, and the URL changes with the record.
      "Cache-Control": "private, max-age=300",
    },
  });
}
