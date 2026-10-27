import "server-only";

import { prisma } from "@/lib/db";
import { RIDER_DOC_KINDS } from "@/lib/riders/onboarding";
import { FileTooLargeError, UnsupportedFileTypeError, put, remove } from "@/lib/storage";

/**
 * The photo and KYC copies on a rider's record — shared by the onboarding
 * drawer's actions and the app's self sign-up, so both store files the same
 * way under the same keys.
 */

/** Stores one uploaded file, turning the storage rules into form errors. */
export async function storeEmployeeFile(employeeId: string, file: File) {
  try {
    return await put(`employee-${employeeId}`, file.name, Buffer.from(await file.arrayBuffer()), file.type);
  } catch (err) {
    if (err instanceof FileTooLargeError || err instanceof UnsupportedFileTypeError) {
      throw new Error(err.message);
    }
    throw err;
  }
}

/**
 * Saves the photo (`photo`) and the KYC copies (`doc:<kind>`) a form posts.
 * Replacing one removes what it replaced, so nothing is orphaned in storage.
 */
export async function saveEmployeeFiles(employeeId: string, formData: FormData, uploadedById: string | null) {
  const photo = formData.get("photo");
  if (photo instanceof File && photo.size > 0) {
    const previous = await prisma.employee.findUnique({ where: { id: employeeId }, select: { photoKey: true } });
    const stored = await storeEmployeeFile(employeeId, photo);
    await prisma.employee.update({ where: { id: employeeId }, data: { photoKey: stored.key } });
    if (previous?.photoKey) await remove(previous.photoKey).catch(() => undefined);
  }

  for (const kind of RIDER_DOC_KINDS) {
    const file = formData.get(`doc:${kind}`);
    if (!(file instanceof File) || file.size === 0) continue;
    const previous = await prisma.employeeDocument.findUnique({
      where: { employeeId_kind: { employeeId, kind } },
      select: { storageKey: true },
    });
    const stored = await storeEmployeeFile(employeeId, file);
    await prisma.employeeDocument.upsert({
      where: { employeeId_kind: { employeeId, kind } },
      create: {
        employeeId, kind, storageKey: stored.key, fileName: file.name,
        fileSize: stored.size, mimeType: stored.mimeType, uploadedById,
      },
      update: {
        storageKey: stored.key, fileName: file.name,
        fileSize: stored.size, mimeType: stored.mimeType, uploadedById,
      },
    });
    if (previous?.storageKey) await remove(previous.storageKey).catch(() => undefined);
  }
}
