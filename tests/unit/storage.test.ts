import { afterAll, describe, expect, it } from "vitest";
import { rm } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";

process.env.STORAGE_DIR = join(tmpdir(), `nn-storage-test-${Date.now()}`);

const { put, get, remove, storageRoot, MAX_FILE_BYTES, FileTooLargeError, UnsupportedFileTypeError } =
  await import("@/lib/storage");

afterAll(async () => {
  await rm(storageRoot(), { recursive: true, force: true });
});

describe("document storage", () => {
  it("stores and reads a file back byte for byte", async () => {
    const bytes = Buffer.from("%PDF-1.7 fake drawing");
    const stored = await put("project-1", "plan.pdf", bytes, "application/pdf");
    expect(stored.size).toBe(bytes.byteLength);
    expect(await get(stored.key)).toEqual(bytes);
  });

  it("generates the stored name rather than trusting the upload", async () => {
    const stored = await put("project-1", "plan.pdf", Buffer.from("x"), "application/pdf");
    expect(stored.key).not.toContain("plan");
    expect(stored.key.endsWith(".pdf")).toBe(true);
  });

  it("records a checksum so tampering is detectable", async () => {
    const a = await put("p", "a.pdf", Buffer.from("same"), "application/pdf");
    const b = await put("p", "b.pdf", Buffer.from("same"), "application/pdf");
    const c = await put("p", "c.pdf", Buffer.from("different"), "application/pdf");
    expect(a.checksum).toBe(b.checksum);
    expect(a.checksum).not.toBe(c.checksum);
  });

  it("refuses a file above the size limit", async () => {
    const tooBig = Buffer.alloc(MAX_FILE_BYTES + 1);
    await expect(put("p", "big.pdf", tooBig, "application/pdf")).rejects.toThrow(FileTooLargeError);
  });

  it("refuses an empty file", async () => {
    await expect(put("p", "empty.pdf", Buffer.alloc(0), "application/pdf")).rejects.toThrow(/empty/i);
  });

  it("refuses an unsupported type", async () => {
    await expect(
      put("p", "evil.sh", Buffer.from("#!/bin/sh"), "application/x-sh"),
    ).rejects.toThrow(UnsupportedFileTypeError);
  });

  it("strips path traversal out of the scope", async () => {
    const stored = await put("../../etc", "x.pdf", Buffer.from("x"), "application/pdf");
    expect(stored.key).not.toContain("..");
    // And it still lands inside the root.
    await expect(get(stored.key)).resolves.toBeInstanceOf(Buffer);
  });

  it("refuses to read outside the storage root", async () => {
    await expect(get("../../../etc/passwd")).rejects.toThrow(/outside the storage root/i);
  });

  it("deletes a file", async () => {
    const stored = await put("p", "gone.pdf", Buffer.from("bye"), "application/pdf");
    await remove(stored.key);
    await expect(get(stored.key)).rejects.toThrow();
  });

  it("treats deleting a missing file as a no-op", async () => {
    await expect(remove("p/does-not-exist.pdf")).resolves.toBeUndefined();
  });
});
