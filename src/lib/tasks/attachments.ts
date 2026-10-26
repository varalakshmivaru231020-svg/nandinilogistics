import { ALLOWED_MIME, FileTooLargeError, MAX_FILE_BYTES, UnsupportedFileTypeError } from "@/lib/storage";

/** The files posted under one field, dropping the empty entry a bare input sends. */
export function filesFrom(formData: FormData, field = "files"): File[] {
  return formData.getAll(field).filter((f): f is File => f instanceof File && f.size > 0);
}

/**
 * Whether these files can be stored at all, checked before anything is written,
 * so a file that was always going to be refused stops the task rather than
 * leaving one raised with its attachment missing. The same size and type rule
 * the storage layer enforces, asked a moment earlier.
 */
export function assertStorable(files: File[]): void {
  for (const file of files) {
    if (file.size > MAX_FILE_BYTES) throw new FileTooLargeError(file.size);
    if (!ALLOWED_MIME.has(file.type)) throw new UnsupportedFileTypeError(file.type);
  }
}
