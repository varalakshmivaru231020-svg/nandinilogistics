import "server-only";

import { NextResponse } from "next/server";

import { get } from "@/lib/storage";

/**
 * Streams a stored photograph — shared by the web's `/api/hr/photo/[id]` and
 * the app's own-photo route, which differ only in who may ask.
 */
export async function photoResponse(photoKey: string | null | undefined): Promise<NextResponse> {
  if (!photoKey) return new NextResponse("No photograph on this record.", { status: 404 });

  let bytes: Buffer;
  try {
    bytes = await get(photoKey);
  } catch {
    return new NextResponse("The stored photograph is missing.", { status: 410 });
  }

  const ext = photoKey.split(".").pop()?.toLowerCase();
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
