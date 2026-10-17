import { describe, expect, it, vi } from "vitest";

const cookieBox = vi.hoisted(() => ({ value: null as string | null }));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      name === "nn_session" && cookieBox.value ? { name, value: cookieBox.value } : undefined,
    set: () => undefined,
    delete: () => undefined,
  }),
  headers: async () => new Map<string, string>(),
}));

vi.mock("next/cache", () => ({ revalidatePath: () => undefined, revalidateTag: () => undefined }));

import { actAs, bindCookieBox, cleanupActionSessions } from "./action-harness";
import { prisma } from "./helpers";

import { FORMS } from "@/lib/forms/registry";
import { resolveForm } from "@/lib/forms/resolve";
import { getAuthContext } from "@/lib/rbac/context";

bindCookieBox(cookieBox);

/**
 * Every form in the registry, resolved against the real database.
 *
 * A form's option lists come from `OptionSource` — stores, document types,
 * designations — and a source the resolver does not know is not a type error
 * anywhere: the form simply arrives with an empty dropdown, or the route
 * answers 500. So each one is resolved as a real actor and its lists are
 * checked to be lists.
 */
describe("every form resolves against the database", () => {
  it("resolves, with each of its choosers a list", async () => {
    await actAs("owner@nninfra.example");
    const ctx = (await getAuthContext())!;

    // An id for the edit forms, which start as the record stands.
    const ids: Record<string, string | undefined> = {
      "units:edit": (await prisma.unit.findFirst({ select: { id: true } }))?.id,
      "hr/employees:edit": (await prisma.employee.findFirst({ select: { id: true } }))?.id,
      "projects/projects:editDocument": (
        await prisma.projectDocument.findFirst({ select: { id: true } })
      )?.id,
    };

    const empty: string[] = [];
    for (const key of Object.keys(FORMS)) {
      const resolved = await resolveForm(ctx, key, ids[key]);
      // An edit form without an id of its own says so; that is not a fault.
      if (typeof resolved === "string" || !("fields" in resolved)) {
        expect(resolved, `${key} refused: ${JSON.stringify(resolved)}`).toBe("no-record");
        continue;
      }
      for (const field of resolved.fields) {
        if (!["select", "lookup", "multi", "suggest"].includes(field.kind)) continue;
        expect(Array.isArray(field.options), `${key} → ${field.name} has no options list`).toBe(true);
        if ((field.options ?? []).length === 0) empty.push(`${key} → ${field.name}`);
      }
    }

    /*
     * An empty list is legitimate — a database with no vendors in it — so this
     * is printed rather than failed. It is here because a chooser that is
     * always empty is how a source that resolves to nothing looks.
     */
    if (empty.length) console.log(`choosers with nothing in them: ${empty.join(", ")}`);

    await cleanupActionSessions();
  });

  /*
   * The three forms whose fields the app had to grow a `files` kind for, with
   * the attributes the phone draws them from: one photograph with a camera,
   * two identity copies, and the document's single file.
   */
  it("sends the file fields with the web's own accept", async () => {
    await actAs("owner@nninfra.example");
    const ctx = (await getAuthContext())!;

    const employee = await resolveForm(ctx, "hr/employees:create");
    expect(typeof employee === "string" ? employee : "ok").toBe("ok");
    if (typeof employee !== "string" && "fields" in employee) {
      const files = employee.fields.filter((f) => f.kind === "files");
      expect(files.map((f) => f.name)).toEqual(["photo", "doc:Aadhaar card", "doc:PAN card"]);
      expect(files[0].accept).toBe("image/*");
      expect(files[0].maxFiles).toBe(1);
    }

    const document = await resolveForm(ctx, "projects/projects:uploadDocument");
    if (typeof document !== "string" && "fields" in document) {
      const file = document.fields.find((f) => f.kind === "files");
      expect(file?.name).toBe("file");
      expect(file?.maxFiles).toBe(1);
    }

    await cleanupActionSessions();
  });
});
