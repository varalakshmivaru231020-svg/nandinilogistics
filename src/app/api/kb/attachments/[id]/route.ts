import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { getAuthContext } from "@/lib/rbac/context";
import { get } from "@/lib/storage";
import { PERM } from "@/lib/permissions/codes";

/**
 * Streams a knowledge-base attachment. `?download=1` sends it as a file; the
 * design's "View" opens it inline instead.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const ctx = await getAuthContext();
  if (!ctx) return new NextResponse("Sign-in required.", { status: 401 });
  if (!ctx.has(PERM.kb.article.view)) {
    return new NextResponse("You do not have permission to open knowledge-base files.", { status: 403 });
  }

  const file = await prisma.kbAttachment.findUnique({
    where: { id },
    select: {
      storageKey: true, fileName: true, mimeType: true,
      article: { select: { isPublished: true } },
    },
  });
  if (!file) return new NextResponse("File not found.", { status: 404 });
  if (!file.article.isPublished && !ctx.has(PERM.kb.article.publish)) {
    return new NextResponse("This article is not published.", { status: 403 });
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
