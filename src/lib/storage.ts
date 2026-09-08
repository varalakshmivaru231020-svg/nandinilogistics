import { createHash, randomUUID } from "crypto";
import { mkdir, readFile, unlink, writeFile } from "fs/promises";
import { dirname, extname, join, normalize, resolve, sep } from "path";

/**
 * Document storage.
 *
 * A thin driver boundary so the local filesystem can be swapped for cloud
 * object storage without touching callers: only `put`, `get` and `remove`
 * would change. Files are addressed by an opaque key, never by user-supplied
 * path, so a crafted filename cannot escape the storage root.
 */

const ROOT = resolve(process.env.STORAGE_DIR ?? join(process.cwd(), "storage"));

/** 25 MB — enough for a drawing set, small enough to keep a request honest. */
export const MAX_FILE_BYTES = 25 * 1024 * 1024;

export const ALLOWED_MIME = new Set([
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
]);

export class FileTooLargeError extends Error {
  constructor(bytes: number) {
    super(
      `That file is ${(bytes / 1024 / 1024).toFixed(1)} MB. The limit is ${MAX_FILE_BYTES / 1024 / 1024} MB.`,
    );
    this.name = "FileTooLargeError";
  }
}

export class UnsupportedFileTypeError extends Error {
  constructor(mime: string) {
    super(`${mime || "That file type"} cannot be uploaded. Use a PDF, image, drawing or Office document.`);
    this.name = "UnsupportedFileTypeError";
  }
}

export interface StoredFile {
  key: string;
  size: number;
  mimeType: string;
  checksum: string;
}

/** Resolves a key to an absolute path, refusing anything outside the root. */
function pathFor(key: string): string {
  const full = resolve(ROOT, normalize(key));
  if (full !== ROOT && !full.startsWith(ROOT + sep)) {
    throw new Error("Refusing to touch a path outside the storage root.");
  }
  return full;
}

export async function put(
  scope: string,
  fileName: string,
  bytes: Buffer,
  mimeType: string,
): Promise<StoredFile> {
  if (bytes.byteLength === 0) throw new Error("That file is empty.");
  if (bytes.byteLength > MAX_FILE_BYTES) throw new FileTooLargeError(bytes.byteLength);
  if (!ALLOWED_MIME.has(mimeType)) throw new UnsupportedFileTypeError(mimeType);

  // The stored name is generated; only the extension survives from user input.
  const ext = extname(fileName).slice(0, 10).replace(/[^A-Za-z0-9.]/g, "");
  const safeScope = scope.replace(/[^A-Za-z0-9_-]/g, "");
  const key = join(safeScope, `${randomUUID()}${ext}`);

  const target = pathFor(key);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, bytes);

  return {
    key,
    size: bytes.byteLength,
    mimeType,
    checksum: createHash("sha256").update(bytes).digest("hex"),
  };
}

export async function get(key: string): Promise<Buffer> {
  return readFile(pathFor(key));
}

export async function remove(key: string): Promise<void> {
  await unlink(pathFor(key)).catch(() => undefined);
}

export function storageRoot(): string {
  return ROOT;
}
