import { describe, expect, it } from "vitest";

import { assertStorable, filesFrom, labelFrom } from "@/lib/material/grn-attachments";
import { MAX_FILE_BYTES } from "@/lib/storage";

function file(name: string, type: string, bytes: number): File {
  return new File([new Uint8Array(bytes)], name, { type });
}

describe("what may be attached to a receipt", () => {
  it("accepts a challan photo", () => {
    expect(() => assertStorable([file("challan.jpg", "image/jpeg", 2048)])).not.toThrow();
  });

  it("accepts several files at once", () => {
    expect(() =>
      assertStorable([
        file("challan.jpg", "image/jpeg", 2048),
        file("weighbridge.pdf", "application/pdf", 4096),
      ]),
    ).not.toThrow();
  });

  it("refuses a file over the limit, naming the size", () => {
    expect(() => assertStorable([file("huge.jpg", "image/jpeg", MAX_FILE_BYTES + 1)]))
      .toThrow(/limit is 25 MB/);
  });

  it("refuses a type the store will not take", () => {
    expect(() => assertStorable([file("macro.exe", "application/x-msdownload", 10)])).toThrow();
  });

  it("refuses the whole batch when one file is wrong", () => {
    expect(() =>
      assertStorable([
        file("challan.jpg", "image/jpeg", 2048),
        file("macro.exe", "application/x-msdownload", 10),
      ]),
    ).toThrow();
  });

  it("passes an empty list, because attaching nothing is allowed", () => {
    expect(() => assertStorable([])).not.toThrow();
  });
});

describe("reading the files off a form", () => {
  it("takes the files that have content", () => {
    const fd = new FormData();
    fd.append("files", file("a.jpg", "image/jpeg", 10));
    fd.append("files", file("b.pdf", "application/pdf", 20));
    expect(filesFrom(fd).map((f) => f.name)).toEqual(["a.jpg", "b.pdf"]);
  });

  it("ignores the empty input a browser sends when nothing was picked", () => {
    const fd = new FormData();
    fd.append("files", file("", "application/octet-stream", 0));
    expect(filesFrom(fd)).toEqual([]);
  });

  it("gives an empty list when the field is not there at all", () => {
    expect(filesFrom(new FormData())).toEqual([]);
  });

  it("trims the label, and treats a blank one as none", () => {
    const fd = new FormData();
    fd.set("label", "  Weighbridge slip  ");
    expect(labelFrom(fd)).toBe("Weighbridge slip");
    fd.set("label", "   ");
    expect(labelFrom(fd)).toBeNull();
    expect(labelFrom(new FormData())).toBeNull();
  });
});
