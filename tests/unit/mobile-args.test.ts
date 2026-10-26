import { describe, expect, it } from "vitest";

import { buildArgs, coerce, toFormData } from "@/lib/api/mobile-args";
import { MOBILE_ACTION_KEYS } from "@/lib/api/mobile-actions";

const arg = (over: Partial<Parameters<typeof coerce>[0]> = {}) => ({
  name: "value", kind: "text" as const, ...over,
});

describe("carrying an argument across the boundary", () => {
  it("takes text, a number, a flag and a list of ids", () => {
    expect(coerce(arg(), "abc", null)).toBe("abc");
    expect(coerce(arg({ kind: "num" }), "12", null)).toBe(12);
    expect(coerce(arg({ kind: "bool" }), true, null)).toBe(true);
    expect(coerce(arg({ kind: "ids" }), ["a", "b"], null)).toEqual(["a", "b"]);
  });

  it("refuses a value of the wrong sort rather than coercing it quietly", () => {
    expect(() => coerce(arg(), 5, null)).toThrow("must be text");
    expect(() => coerce(arg({ kind: "bool" }), "true", null)).toThrow("true or false");
    expect(() => coerce(arg({ kind: "num" }), "lots", null)).toThrow("must be a number");
    expect(() => coerce(arg({ kind: "ids" }), ["a", 2], null)).toThrow("list of ids");
  });

  /*
   * The type that restricts these is erased by the time the action runs:
   * `"PM" | "ADMIN"` is just a string, and an action switching on it without a
   * default would read an unknown value as neither. So it is checked here.
   */
  it("holds an enum to the values the action declares", () => {
    const level = arg({ kind: "enum", values: ["PM", "ADMIN"] });
    expect(coerce(level, "PM", null)).toBe("PM");
    expect(() => coerce(level, "OWNER", null)).toThrow("must be one of: PM, ADMIN");
  });

  it("says which argument is missing, by the name the action gave it", () => {
    expect(() => coerce(arg({ name: "remark" }), undefined, null)).toThrow("`remark` is required");
  });

  it("leaves an absent optional absent, so the action's own default applies", () => {
    expect(coerce(arg({ optional: true }), undefined, null)).toBeUndefined();
  });

  it("passes a record through for the action's own zod to judge", () => {
    const input = { items: [{ itemId: "i1", qty: 3 }] };
    expect(coerce(arg({ kind: "json" }), input, null)).toBe(input);
  });
});

describe("a form argument", () => {
  it("becomes the FormData the action reads", () => {
    const form = toFormData({ title: "Slab check", priority: "HIGH" }, "formData");
    expect(form.get("title")).toBe("Slab check");
    expect(form.get("priority")).toBe("HIGH");
  });

  /* A repeated field is how a multi-select arrives, and what getAll() reads. */
  it("repeats a field for each value of a list", () => {
    const form = toFormData({ assigneeIds: ["u1", "u2"] }, "formData");
    expect(form.getAll("assigneeIds")).toEqual(["u1", "u2"]);
  });

  it("leaves out a field that was not given, rather than sending \"null\"", () => {
    const form = toFormData({ title: "x", location: null, note: undefined }, "formData");
    expect(form.has("location")).toBe(false);
    expect(form.has("note")).toBe(false);
  });

  it("will not accept a list or a scalar where fields were meant", () => {
    expect(() => toFormData(["a"], "formData")).toThrow("object of form fields");
    expect(() => toFormData("a", "formData")).toThrow("object of form fields");
  });

  /* An attachment cannot travel in JSON, so a multipart body stands in for it. */
  it("takes the request's own FormData when the body is multipart", () => {
    const attached = new FormData();
    attached.append("file", "x");
    expect(coerce(arg({ kind: "form" }), "@formdata", attached)).toBe(attached);
    expect(() => coerce(arg({ kind: "form" }), "@formdata", null)).toThrow("multipart body");
  });

  /*
   * The half-and-half body the app sends: the fields as JSON, because that is
   * how every other argument travels, and the files as parts of the same
   * request, because JSON cannot carry a photograph. Merged here so that the
   * action reads one FormData — the browser's own body.
   *
   * This is what was dropping attachments: the files arrived, the fields were
   * turned into a fresh FormData, and the two were never put together.
   */
  it("puts the files of a multipart request into the form the fields built", () => {
    const attached = new FormData();
    attached.append("files", new File(["\u0001\u0002"], "snag.jpg", { type: "image/jpeg" }));
    attached.append("files", new File(["\u0003"], "plan.pdf", { type: "application/pdf" }));

    const form = coerce(
      arg({ kind: "form" }),
      { verdict: "APPROVE", remark: "Cover blocks at 25 mm." },
      attached,
    ) as FormData;

    expect(form.get("verdict")).toBe("APPROVE");
    expect(form.get("remark")).toBe("Cover blocks at 25 mm.");
    expect(form.getAll("files").map((f) => (f as File).name)).toEqual(["snag.jpg", "plan.pdf"]);
  });

  /*
   * The fields are the JSON's. A text part of the same request is somebody
   * else's idea of a field — `args` itself, for one — and taking it would make
   * two places decide what the body says.
   */
  it("ignores the text parts of that request, and empty files", () => {
    const attached = new FormData();
    attached.append("remark", "not this one");
    attached.append("files", new File([], "nothing.jpg", { type: "image/jpeg" }));
    const form = coerce(arg({ kind: "form" }), { remark: "this one" }, attached) as FormData;
    expect(form.getAll("remark")).toEqual(["this one"]);
    expect(form.getAll("files")).toEqual([]);
  });
});


describe("building a whole argument list", () => {
  const def = {
    fn: (async () => ({ ok: true })) as never,
    args: [
      { name: "id", kind: "text" as const },
      { name: "remark", kind: "text" as const, optional: true },
    ],
  };

  it("passes them positionally, in the order the action takes them", () => {
    expect(buildArgs(def, ["t1", "done"], null)).toEqual(["t1", "done"]);
  });

  /*
   * Dropped rather than passed as undefined, so a parameter written
   * `remarks = ""` gets its default instead of the absence of one.
   */
  it("drops a trailing optional that was not given", () => {
    expect(buildArgs(def, ["t1"], null)).toEqual(["t1"]);
  });

  it("refuses more arguments than the action takes", () => {
    expect(() => buildArgs(def, ["t1", "a", "b"], null)).toThrow("takes 2 argument(s), not 3");
  });

  it("insists the arguments are a positional list", () => {
    expect(() => buildArgs(def, { id: "t1" }, null)).toThrow("`args` must be a list");
  });
});

describe("the registry covers the web", () => {
  /*
   * The generator reads the signatures, so this is not checking its arithmetic
   * — it is checking that the file on disk was regenerated. A registry built
   * before the last action was added is a silently missing endpoint.
   */
  it("is in step with `pnpm mobile:sync`", async () => {
    const { readFileSync, readdirSync, statSync } = await import("node:fs");
    const { join } = await import("node:path");
    const APP = join(__dirname, "..", "..", "src", "app");

    const files = (dir: string): string[] =>
      readdirSync(dir).flatMap((e) => {
        const full = join(dir, e);
        return statSync(full).isDirectory() ? files(full) : /\.ts$/.test(e) ? [full] : [];
      });

    const inWeb = new Set<string>();
    for (const file of files(APP)) {
      const posix = file.split("\\").join("/");
      if (posix.includes("/masters/") || posix.includes("/admin/")) continue;
      const src = readFileSync(file, "utf8");
      if (!src.includes("use server")) continue;
      for (const [, name] of src.matchAll(/export async function ([a-zA-Z0-9_]+)Action\s*\(/g)) {
        // The boundary issues its own bearer token; the web login sets a cookie.
        if (["run", "login", "logout"].includes(name)) continue;
        inWeb.add(name);
      }
    }

    const dispatchable = new Set(MOBILE_ACTION_KEYS.map((k) => k.split("/").pop()!));
    const missing = [...inWeb].filter((n) => !dispatchable.has(n)).sort();
    expect(missing, "run `pnpm mobile:sync`").toEqual([]);
  });

  it("gives every action a key that names its module", () => {
    for (const key of MOBILE_ACTION_KEYS) expect(key).toContain("/");
  });

});
