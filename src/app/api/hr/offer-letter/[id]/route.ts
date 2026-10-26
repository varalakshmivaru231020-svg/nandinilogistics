import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { getAuthContext } from "@/lib/rbac/context";
import { recordAudit } from "@/lib/audit";
import { employeeScope } from "@/lib/hr/list-filters";
import { get } from "@/lib/storage";
import { PERM } from "@/lib/permissions/codes";

/**
 * Streams a rider's offer letter — the PDF produced on acceptance. Guarded by
 * the offer-letter permission and the viewer's own scope, so a Team Leader
 * downloads letters for their team and nobody else's.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const ctx = await getAuthContext();
  if (!ctx) return new NextResponse("Sign-in required.", { status: 401 });
  if (!ctx.has(PERM.hr.employee.view) || !ctx.has(PERM.hr.employee.offerLetter)) {
    return new NextResponse("You do not have permission to open offer letters.", { status: 403 });
  }

  const rider = await prisma.employee.findFirst({
    where: { id, ...employeeScope(ctx) },
    select: { name: true, employeeCode: true, offerLetterKey: true },
  });
  if (!rider) return new NextResponse("Rider not found.", { status: 404 });
  if (!rider.offerLetterKey) return new NextResponse("No offer letter on this record yet.", { status: 404 });

  let bytes: Buffer;
  try {
    bytes = await get(rider.offerLetterKey);
  } catch {
    return new NextResponse("The stored letter is missing.", { status: 410 });
  }

  await recordAudit({
    action: "EXPORT",
    entity: "Employee",
    entityId: id,
    userId: ctx.id,
    summary: `Downloaded ${rider.name}'s offer letter`,
  });

  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="offer-letter-${rider.employeeCode}.pdf"`,
      "Content-Length": String(bytes.byteLength),
    },
  });
}
