import { describe, expect, it } from "vitest";
import { ZodError, z } from "zod";

import { bearerToken } from "@/lib/auth/session";
import { requestedProject, statusForError } from "@/lib/api/mobile";
import { AuthRequiredError, PermissionError } from "@/lib/rbac/guard";

const req = (headers: Record<string, string>) =>
  new Request("https://nninfra.test/api/mobile/v1/me", { headers });

describe("reading the bearer token", () => {
  it("takes the token out of a well-formed header", () => {
    expect(bearerToken("Bearer abc.def.ghi")).toBe("abc.def.ghi");
  });

  /* Clients disagree about the case of the scheme, and all of them are right. */
  it("does not care how the scheme is capitalised", () => {
    expect(bearerToken("bearer abc")).toBe("abc");
    expect(bearerToken("BEARER abc")).toBe("abc");
  });

  it("copes with extra whitespace", () => {
    expect(bearerToken("  Bearer   abc  ")).toBe("abc");
  });

  it("is nothing when the header is missing", () => {
    expect(bearerToken(null)).toBeNull();
    expect(bearerToken(undefined)).toBeNull();
    expect(bearerToken("")).toBeNull();
  });

  /*
   * A bare token is refused rather than guessed at. Accepting it would mean the
   * app could authenticate two different ways, only one of which is tested.
   */
  it("refuses anything that is not a bearer token", () => {
    expect(bearerToken("abc.def.ghi")).toBeNull();
    expect(bearerToken("Basic dXNlcjpwYXNz")).toBeNull();
    expect(bearerToken("Bearer")).toBeNull();
    expect(bearerToken("Bearer a b")).toBeNull();
  });
});

describe("the project the app says it is looking at", () => {
  it("reads the header", () => {
    expect(requestedProject(req({ "x-project": "prj_1" }))).toBe("prj_1");
  });

  it("is null when absent or blank", () => {
    expect(requestedProject(req({}))).toBeNull();
    expect(requestedProject(req({ "x-project": "   " }))).toBeNull();
  });
});

describe("what status a failure deserves", () => {
  /*
   * 401 against 403 is the distinction the app acts on: the first means sign in
   * again, the second means stop asking. Returning 401 for a missing permission
   * would put the app in a loop — sign in, be refused, sign in again.
   */
  it("separates not signed in from not allowed", () => {
    expect(statusForError(new AuthRequiredError()).status).toBe(401);

    const denied = statusForError(new PermissionError("material.indent.approvePm"));
    expect(denied.status).toBe(403);
    expect(denied.code).toBe("material.indent.approvePm");
  });

  it("reports a validation failure as the first readable complaint", () => {
    let err: unknown;
    try {
      z.object({ email: z.string().email("Enter a valid email address") }).parse({ email: "x" });
    } catch (caught) {
      err = caught;
    }
    expect(err).toBeInstanceOf(ZodError);
    expect(statusForError(err)).toMatchObject({
      status: 422,
      error: "Enter a valid email address",
    });
  });

  it("does not leak a non-Error as a message", () => {
    expect(statusForError("boom")).toEqual({ status: 500, error: "Something went wrong." });
  });

  it("passes an ordinary Error through as a bad request", () => {
    expect(statusForError(new Error("Indent is already approved."))).toEqual({
      status: 400,
      error: "Indent is already approved.",
    });
  });
});
