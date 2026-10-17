import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

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

vi.mock("next/cache", () => ({
  revalidatePath: () => undefined,
  revalidateTag: () => undefined,
}));

import { actAs, bindCookieBox, cleanupActionSessions } from "./action-harness";
import { prisma, tag } from "./helpers";

import { POST as login } from "@/app/api/mobile/v1/auth/login/route";
import { POST as doAction } from "@/app/api/mobile/v1/do/[...action]/route";
import { MOBILE_ACTIONS } from "@/lib/api/mobile-actions";
import { buildArgs } from "@/lib/api/mobile-args";
import { FORMS } from "@/lib/forms/registry";
import { remove } from "@/lib/storage";

bindCookieBox(cookieBox);

/**
 * The forms that carry a file, called the way the phone calls them.
 *
 * These three were listed in `parity.ts` as beyond the app — "a document is a
 * file. The boundary has no upload path." It has one now, so the employee's
 * photograph, the receipt's challan and the project's drawings are the app's
 * own, and this is the proof: the arguments go through the boundary's own
 * `buildArgs`, with the fields as JSON and the files as parts, and then
 * through the web's real action.
 */
describe("a form that carries a file, from the phone", () => {
  const suffix = tag();
  const stored: string[] = [];
  const employees: string[] = [];
  const documents: string[] = [];
  const attachments: string[] = [];
  let grnId: string;
  let projectId: string;
  let documentTypeId: string;
  let employmentTypeId: string;

  /** A real little JPEG, and a real little PDF. */
  const jpeg = (name: string) =>
    new File([Buffer.from([0xff, 0xd8, 0xff, 0xdb, 0x00, 0x01])], name, { type: "image/jpeg" });
  const pdf = (name: string) =>
    new File([Buffer.from("%PDF-1.4\n%%EOF\n")], name, { type: "application/pdf" });

  /** The request the app makes: the fields as JSON, the files as parts. */
  function send(actionKey: string, args: unknown[], files: Array<[string, File]>) {
    const attached = new FormData();
    for (const [field, file] of files) attached.append(field, file);
    const def = MOBILE_ACTIONS[actionKey];
    expect(def, `no such action: ${actionKey}`).toBeDefined();
    const built = buildArgs(def, args, attached);
    return (def.fn as unknown as (...a: unknown[]) => Promise<{ ok: boolean; error?: string; data?: unknown }>)(
      ...built,
    );
  }

  beforeAll(async () => {
    const [grn, project, docType, empType] = await Promise.all([
      prisma.grn.findFirstOrThrow({ select: { id: true } }),
      prisma.project.findFirstOrThrow({ where: { code: "NNS" }, select: { id: true } }),
      prisma.documentType.findFirstOrThrow({ select: { id: true } }),
      prisma.employmentType.findFirstOrThrow({ select: { id: true } }),
    ]);
    grnId = grn.id;
    projectId = project.id;
    documentTypeId = docType.id;
    employmentTypeId = empType.id;
    await actAs("owner@nninfra.example");
  });

  afterAll(async () => {
    for (const key of stored) await remove(key).catch(() => undefined);
    await prisma.employeeDocument.deleteMany({ where: { employeeId: { in: employees } } });
    await prisma.employee.deleteMany({ where: { id: { in: employees } } });
    await prisma.projectDocument.deleteMany({ where: { id: { in: documents } } });
    await prisma.grnAttachment.deleteMany({ where: { id: { in: attachments } } });
    await cleanupActionSessions();
  });

  /*
   * The same upload, over the endpoint itself, with the path escaped the way a
   * client has to escape it.
   *
   * `projects/[id]/documents/uploadDocument` is an action key with a route
   * folder in it, and a bracket is not legal in a URL path — so the app sends
   * `%5Bid%5D` and the route used to look up the raw pathname, which matched
   * nothing. All three document actions answered "No such action" from the
   * phone while being perfectly reachable in a test that called them directly.
   */
  it("reaches a bracketed action key over the endpoint, escaped as a client escapes it", async () => {
    const signIn = await login(
      new Request("https://nninfra.test/api/mobile/v1/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: "owner@nninfra.example",
          password: "Nninfra@2026",
          device: "Pixel · upload test",
        }),
      }),
    );
    const session = (await signIn.json()) as { ok: boolean; data?: { token: string } };
    expect(session.ok, "sign-in failed").toBe(true);
    const token = session.data!.token;

    const form = new FormData();
    form.set(
      "args",
      JSON.stringify([projectId, { title: `Escaped ${suffix}`, documentTypeId, access: "Owner only" }]),
    );
    form.append("file", pdf(`escaped-${suffix}.pdf`));

    const res = await doAction(
      new Request(
        "https://nninfra.test/api/mobile/v1/do/projects/%5Bid%5D/documents/uploadDocument",
        { method: "POST", headers: { authorization: `Bearer ${token}` }, body: form },
      ),
    );
    const json = (await res.json()) as { ok: boolean; error?: string };
    expect(json.error ?? null).toBeNull();
    expect(res.status).toBe(200);

    const doc = await prisma.projectDocument.findFirstOrThrow({
      where: { projectId, title: `Escaped ${suffix}` },
    });
    documents.push(doc.id);
    stored.push(doc.storageKey);
    expect(doc.fileName).toBe(`escaped-${suffix}.pdf`);

    await prisma.session.deleteMany({ where: { userAgent: "Pixel · upload test" } });
  });

  /*
   * The whole employee drawer, which the app did not have at all: the
   * particulars, the photograph and the two identity copies, in one body.
   */
  it("adds an employee with a photograph and an Aadhaar copy", async () => {
    const fields = FORMS["hr/employees:create"].fields.map((f) => f.name);
    expect(fields).toContain("photo");
    expect(fields).toContain("doc:Aadhaar card");
    expect(fields).toContain("doc:PAN card");

    const res = await send(
      "hr/createEmployee",
      [
        {
          employmentTypeId,
          name: `Phone Hire ${suffix}`,
          mobile: "+91 98765 43210",
          aadhaar: `9${suffix.replace(/\D/g, "").padEnd(11, "0").slice(0, 11)}`,
          pan: "ABCDE1234F",
          address: "House, area, city",
        },
      ],
      [["photo", jpeg(`photo-${suffix}.jpg`)], ["doc:Aadhaar card", pdf(`aadhaar-${suffix}.pdf`)]],
    );
    expect(res.error ?? null).toBeNull();
    expect(res.ok).toBe(true);

    const made = await prisma.employee.findFirstOrThrow({
      where: { name: `Phone Hire ${suffix}` },
      include: { documents: true },
    });
    employees.push(made.id);
    stored.push(...[made.photoKey, ...made.documents.map((d) => d.storageKey)].filter((k): k is string => Boolean(k)));

    // The photograph the design makes mandatory, and the copy beside it.
    expect(made.photoKey).toBeTruthy();
    expect(made.documents.map((d) => d.kind)).toEqual(["Aadhaar card"]);
    expect(made.documents[0].fileName).toBe(`aadhaar-${suffix}.pdf`);
  });

  it("attaches a challan to a goods receipt", async () => {
    const res = await send(
      "material/grn/addGrnAttachments",
      [grnId, { label: "Challan" }],
      [["files", jpeg(`challan-${suffix}.jpg`)]],
    );
    expect(res.error ?? null).toBeNull();
    expect(res.data).toEqual({ added: 1 });

    const added = await prisma.grnAttachment.findMany({
      where: { grnId, fileName: `challan-${suffix}.jpg` },
    });
    attachments.push(...added.map((a) => a.id));
    stored.push(...added.map((a) => a.storageKey));
    expect(added).toHaveLength(1);
    expect(added[0].label).toBe("Challan");
  });

  it("uploads a project document, and renames it afterwards", async () => {
    const res = await send(
      "projects/[id]/documents/uploadDocument",
      [projectId, { title: `Site plan ${suffix}`, documentTypeId, access: "All roles · view" }],
      [["file", pdf(`plan-${suffix}.pdf`)]],
    );
    expect(res.error ?? null).toBeNull();
    expect(res.ok).toBe(true);

    const doc = await prisma.projectDocument.findFirstOrThrow({
      where: { projectId, title: `Site plan ${suffix}` },
    });
    documents.push(doc.id);
    stored.push(doc.storageKey);
    expect(doc.fileName).toBe(`plan-${suffix}.pdf`);
    expect(doc.access).toBe("All roles · view");
    expect(doc.version).toBe(1);

    // The edit form takes an object, not a form: the stored file is untouched.
    const renamed = await send(
      "projects/[id]/documents/updateDocument",
      [doc.id, { title: `Site plan ${suffix} rev B`, documentTypeId, access: "Owner only" }],
      [],
    );
    expect(renamed.error ?? null).toBeNull();
    const after = await prisma.projectDocument.findUniqueOrThrow({ where: { id: doc.id } });
    expect(after.title).toBe(`Site plan ${suffix} rev B`);
    expect(after.access).toBe("Owner only");
    expect(after.storageKey).toBe(doc.storageKey);
  });
});
