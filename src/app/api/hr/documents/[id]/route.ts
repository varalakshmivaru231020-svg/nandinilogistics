import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { getAuthContext } from "@/lib/rbac/context";
import { recordAudit } from "@/lib/audit";
import { get } from "@/lib/storage";
import { PERM } from "@/lib/permissions/codes";

/**
 * Streams an employee's document — the Aadhaar or PAN scan the design shows on
 * the employee record. Guarded like the record itself: identity documents are
 * only readable by someone who may see identity fields.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const ctx = await getAuthContext();
  if (!ctx) return new NextResponse("Sign-in required.", { status: 401 });
  if (!ctx.has(PERM.hr.employee.viewIdentity)) {
    return new NextResponse("You do not have permission to open identity documents.", { status: 403 });
  }

  const document = await prisma.employeeDocument.findUnique({
    where: { id },
    select: {
      storageKey: true, fileName: true, mimeType: true, kind: true,
      employee: { select: { id: true, name: true } },
    },
  });
  if (!document) return new NextResponse("Document not found.", { status: 404 });

  let bytes: Buffer;
  try {
    bytes = await get(document.storageKey);
  } catch {
    return new NextResponse("The stored file is missing.", { status: 410 });
  }

  await recordAudit({
    action: "EXPORT",
    entity: "EmployeeDocument",
    entityId: id,
    userId: ctx.id,
    summary: `Opened ${document.employee.name}'s ${document.kind}`,
  });

  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      "Content-Type": document.mimeType ?? "application/octet-stream",
      "Content-Disposition": `inline; filename="${encodeURIComponent(document.fileName)}"`,
      "Content-Length": String(bytes.byteLength),
    },
  });
}
