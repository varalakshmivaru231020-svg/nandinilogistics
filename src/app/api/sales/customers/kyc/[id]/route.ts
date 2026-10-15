import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { PERM } from "@/lib/permissions/codes";
import { getAuthContext } from "@/lib/rbac/context";
import { get } from "@/lib/storage";

/**
 * Streams one of a customer's identity copies.
 *
 * Behind `sales.customer.viewKyc`, which is the permission that decides whether
 * somebody may see a PAN at all — a scan of it is the same fact in a stronger
 * form. `?download=1` sends it as a file; without it the viewer shows it.
 *
 * The id in the path is the **storage key**, which is opaque and generated, so
 * it names a file without naming a path. `getAuthContext` reads the session
 * cookie or the app's bearer token, so one route serves both clients.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const ctx = await getAuthContext();
  if (!ctx) return new NextResponse("Sign-in required.", { status: 401 });
  if (!ctx.has(PERM.sales.customer.viewKyc)) {
    return new NextResponse("You do not have permission to see identity documents.", { status: 403 });
  }

  /*
   * The key has to belong to a customer on record. Reading it off the customer
   * rather than trusting the path is what stops a guessed key reaching a file
   * that is not a KYC document at all.
   */
  const key = decodeURIComponent(id);
  const customers = await prisma.customer.findMany({ select: { kycDocuments: true } });
  const found = customers
    .flatMap((c) => (Array.isArray(c.kycDocuments) ? (c.kycDocuments as Array<Record<string, unknown>>) : []))
    .find((d) => d.key === key);
  if (!found) return new NextResponse("File not found.", { status: 404 });

  let bytes: Buffer;
  try {
    bytes = await get(key);
  } catch {
    return new NextResponse("The stored file is missing.", { status: 410 });
  }

  const asDownload = new URL(request.url).searchParams.get("download") === "1";
  const name = String(found.fileName ?? "document");
  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      "Content-Type": String(found.mimeType ?? "application/octet-stream"),
      "Content-Disposition": `${asDownload ? "attachment" : "inline"}; filename="${encodeURIComponent(name)}"`,
      "Content-Length": String(bytes.byteLength),
    },
  });
}
