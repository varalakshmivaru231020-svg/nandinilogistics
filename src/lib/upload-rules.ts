/**
 * What an upload is allowed to be, in one place both sides can read.
 *
 * The storage layer enforces this on the server; a form can import it too,
 * because there is nothing here that needs Node. Before this existed the screen
 * invited file types the server refused and sizes the framework dropped before
 * the server saw them, and the person uploading got an error that explained
 * neither.
 */

/** The largest file the system will store. */
export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

/** What the server will accept, by media type. */
export const ACCEPTED_MIME = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/msword",
  "application/vnd.ms-excel",
  "image/vnd.dwg",
  "application/acad",
  "text/plain",
] as const;

/** The same list for a file input's `accept`, so the picker agrees with us. */
export const ACCEPT_ATTR = ".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx,.xls,.xlsx,.dwg,.txt";

/** What to tell someone they may upload. */
export const ACCEPTED_LABEL = "PDF, Word, Excel, images, DWG or plain text — up to 25 MB";

/**
 * Why these files cannot be uploaded, or null when they can.
 *
 * Checked in the browser so the answer is immediate and names the file. The
 * server checks again regardless: a form is a convenience, not a guard.
 */
export function uploadProblem(files: File[]): string | null {
  for (const f of files) {
    if (f.size > MAX_UPLOAD_BYTES) {
      return `${f.name} is ${(f.size / 1024 / 1024).toFixed(1)} MB. The limit is ${MAX_UPLOAD_BYTES / 1024 / 1024} MB.`;
    }
    if (f.type && !(ACCEPTED_MIME as readonly string[]).includes(f.type)) {
      return `${f.name} is not a kind of file that can be stored. ${ACCEPTED_LABEL}.`;
    }
  }
  return null;
}
