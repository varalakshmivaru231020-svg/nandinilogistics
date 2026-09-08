import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { getAuthContext } from "@/lib/rbac/context";
import { recordAudit } from "@/lib/audit";
import { get } from "@/lib/storage";
import { PERM } from "@/lib/permissions/codes";

/**
 * Streams a project document.
 *
 * Guarded exactly like a page: the file is only readable by someone who holds
 * the download permission *and* is mapped to the project it belongs to. The
 * storage key never appears in the URL, so a document cannot be guessed at.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const ctx = await getAuthContext();
  if (!ctx) return new NextResponse("Sign-in required.", { status: 401 });
  if (!ctx.has(PERM.project.document.download)) {
    return new NextResponse("You do not have permission to download documents.", { status: 403 });
  }

  const document = await prisma.projectDocument.findUnique({
    where: { id },
    select: {
      projectId: true, storageKey: true, fileName: true, mimeType: true, title: true,
    },
  });
  if (!document) return new NextResponse("Document not found.", { status: 404 });

  if (!ctx.canAccessAllProjects && !ctx.projectIds.includes(document.projectId)) {
    return new NextResponse("This project is not mapped to you.", { status: 403 });
  }

  let bytes: Buffer;
  try {
    bytes = await get(document.storageKey);
  } catch {
    return new NextResponse("The stored file is missing.", { status: 410 });
  }

  await recordAudit({
    action: "EXPORT",
    entity: "ProjectDocument",
    entityId: id,
    userId: ctx.id,
    projectId: document.projectId,
    summary: `Downloaded document "${document.title}"`,
  });

  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      "Content-Type": document.mimeType ?? "application/octet-stream",
      "Content-Disposition": `attachment; filename="${encodeURIComponent(document.fileName)}"`,
      "Content-Length": String(bytes.byteLength),
      "Cache-Control": "private, no-store",
    },
  });
}
