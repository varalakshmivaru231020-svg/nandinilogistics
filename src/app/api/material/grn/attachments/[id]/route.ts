import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { getAuthContext } from "@/lib/rbac/context";
import { get } from "@/lib/storage";
import { PERM } from "@/lib/permissions/codes";

/**
 * Streams a file attached to a goods receipt — a challan, a weighbridge slip,
 * a photo of the delivery. `?download=1` sends it as a file; without it the
 * browser opens it inline.
 *
 * Seeing the receipt is what governs seeing its paperwork, and the project
 * mapping is checked here too: a GRN belongs to a purchase order, and that
 * order belongs to a project someone may or may not be on.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const ctx = await getAuthContext();
  if (!ctx) return new NextResponse("Sign-in required.", { status: 401 });
  if (!ctx.has(PERM.material.grn.view)) {
    return new NextResponse("You do not have permission to open goods-receipt files.", { status: 403 });
  }

  const file = await prisma.grnAttachment.findUnique({
    where: { id },
    select: {
      storageKey: true, fileName: true, mimeType: true,
      grn: { select: { purchaseOrder: { select: { projectId: true } } } },
    },
  });
  if (!file) return new NextResponse("File not found.", { status: 404 });

  const projectId = file.grn.purchaseOrder.projectId;
  if (!ctx.canAccessAllProjects && !ctx.projectIds.includes(projectId)) {
    return new NextResponse("That receipt is on a project you are not mapped to.", { status: 403 });
  }

  let bytes: Buffer;
  try {
    bytes = await get(file.storageKey);
  } catch {
    return new NextResponse("The stored file is missing.", { status: 410 });
  }

  const asDownload = new URL(request.url).searchParams.get("download") === "1";
  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      "Content-Type": file.mimeType ?? "application/octet-stream",
      "Content-Disposition": `${asDownload ? "attachment" : "inline"}; filename="${encodeURIComponent(file.fileName)}"`,
      "Content-Length": String(bytes.byteLength),
    },
  });
}
