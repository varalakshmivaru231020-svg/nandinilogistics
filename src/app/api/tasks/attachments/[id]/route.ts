import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { getAuthContext } from "@/lib/rbac/context";
import { get } from "@/lib/storage";
import { PERM } from "@/lib/permissions/codes";

/**
 * Streams a file attached to a task — on the task itself or on a remark. `?download=1` sends it as a file.
 *
 * Seeing the task is what governs seeing its files, and that is not a
 * permission alone: without the org-wide view a person reads only the tasks
 * they raised or were given.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const ctx = await getAuthContext();
  if (!ctx) return new NextResponse("Sign-in required.", { status: 401 });
  if (!ctx.has(PERM.task.task.view)) {
    return new NextResponse("You do not have permission to open task files.", { status: 403 });
  }

  const file = await prisma.taskAttachment.findUnique({
    where: { id },
    select: {
      storageKey: true, fileName: true, mimeType: true,
      task: {
        select: {
          createdById: true,
          assignees: { select: { userId: true } },
        },
      },
    },
  });
  if (!file) return new NextResponse("File not found.", { status: 404 });

  const onIt =
    file.task.createdById === ctx.id ||
    file.task.assignees.some((a) => a.userId === ctx.id);
  if (!onIt && !ctx.has(PERM.task.task.viewAll)) {
    return new NextResponse("That file is on a task you have no part in.", { status: 403 });
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
