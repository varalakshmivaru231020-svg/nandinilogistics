import { createHash, randomUUID } from "crypto";
import { mkdir, readFile, unlink, writeFile } from "fs/promises";
import { dirname, extname, join, normalize, resolve, sep } from "path";

import { ACCEPTED_MIME, MAX_UPLOAD_BYTES } from "./upload-rules";

/**
 * Document storage.
 *
 * A thin driver boundary so the local filesystem can be swapped for cloud
 * object storage without touching callers: only `put`, `get` and `remove`
 * would change. Files are addressed by an opaque key, never by user-supplied
 * path, so a crafted filename cannot escape the storage root.
 */

/**
 * Resolved lazily rather than at module scope: a dynamic `resolve()` evaluated
 * during import makes Next's static analysis trace the whole project into the
 * server bundle.
 */
let cachedRoot: string | null = null;

function root(): string {
  if (cachedRoot === null) {
    // turbopackIgnore: the storage root is configured at runtime and in
    // production lives outside the project (/var/www/nninfra/storage), so
    // there is nothing here for the bundler to trace.
    cachedRoot = resolve(/* turbopackIgnore: true */ process.env.STORAGE_DIR ?? join(process.cwd(), "storage"));
  }
  return cachedRoot;
}

/** 25 MB — enough for a drawing set, small enough to keep a request honest. */
// The rules themselves live in upload-rules.ts, which a form can import too —
// a screen that offers a file type the server refuses is a screen that lies.
export const MAX_FILE_BYTES = MAX_UPLOAD_BYTES;
export const ALLOWED_MIME = new Set<string>(ACCEPTED_MIME);

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
  const base = root();
  const full = resolve(base, normalize(key));
  if (full !== base && !full.startsWith(base + sep)) {
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
  // Reads a runtime-generated key under the storage root, never a build asset.
  return readFile(/* turbopackIgnore: true */ pathFor(key));
}

export async function remove(key: string): Promise<void> {
  await unlink(pathFor(key)).catch(() => undefined);
}

export function storageRoot(): string {
  return root();
}
