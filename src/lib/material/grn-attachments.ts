import { prisma } from "@/lib/db";
import {
  ALLOWED_MIME, FileTooLargeError, MAX_FILE_BYTES, UnsupportedFileTypeError, put,
} from "@/lib/storage";

/**
 * Storing the paperwork against a goods receipt — challans, weighbridge slips,
 * photos of what came off the lorry.
 *
 * It lives here rather than in an action because two actions need it and they
 * are guarded differently: attaching a challan while booking the receipt is
 * part of creating it, while adding one afterwards is correcting it. The
 * permission check belongs in the action; the work belongs here.
 */
export interface GrnAttachmentInput {
  grnId: string;
  files: File[];
  label: string | null;
  uploadedById: string;
}

/** Stores each file and records it against the receipt. Returns how many landed. */
export async function storeGrnAttachments({
  grnId, files, label, uploadedById,
}: GrnAttachmentInput): Promise<number> {
  for (const file of files) {
    try {
      const stored = await put(
        `grn-${grnId}`,
        file.name,
        Buffer.from(await file.arrayBuffer()),
        file.type,
      );
      await prisma.grnAttachment.create({
        data: {
          grnId,
          storageKey: stored.key,
          fileName: file.name,
          fileSize: file.size,
          mimeType: file.type || null,
          label,
          uploadedById,
        },
      });
    } catch (err) {
      // The storage limits are a person's mistake, not a fault — say what is
      // wrong with the file rather than failing the whole receipt opaquely.
      if (err instanceof FileTooLargeError || err instanceof UnsupportedFileTypeError) {
        throw new Error(err.message);
      }
      throw err;
    }
  }
  return files.length;
}

/** The files on a form, ignoring the empty input a browser sends when none were picked. */
export function filesFrom(formData: FormData, field = "files"): File[] {
  return formData.getAll(field).filter((f): f is File => f instanceof File && f.size > 0);
}

/** The label typed against a batch of files, or nothing. */
export function labelFrom(formData: FormData, field = "label"): string | null {
  return String(formData.get(field) ?? "").trim() || null;
}

/**
 * Whether these files can be stored at all, checked before anything is written.
 *
 * A receipt moves stock the moment it is booked, so a file that was always
 * going to be refused must stop the whole thing beforehand rather than leave a
 * posted receipt with its challan missing. This is the same size and type rule
 * the storage layer enforces, asked a moment earlier.
 */
export function assertStorable(files: File[]): void {
  for (const file of files) {
    if (file.size > MAX_FILE_BYTES) throw new FileTooLargeError(file.size);
    if (!ALLOWED_MIME.has(file.type)) throw new UnsupportedFileTypeError(file.type);
  }
}
