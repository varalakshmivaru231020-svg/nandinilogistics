import { describe, expect, it } from "vitest";

import { validatePasswordStrength, hashPassword, verifyPassword } from "@/lib/auth/password";

describe("password policy", () => {
  it("accepts a password meeting every rule", () => {
    expect(validatePasswordStrength("Nninfra@2026")).toBeNull();
  });

  it("rejects anything shorter than 10 characters", () => {
    expect(validatePasswordStrength("Ab1@efgh")).toMatch(/10 characters/);
  });

  it("requires an uppercase letter", () => {
    expect(validatePasswordStrength("nandini@2026")).toMatch(/uppercase/);
  });

  it("requires a lowercase letter", () => {
    expect(validatePasswordStrength("NNINFRA@2026")).toMatch(/lowercase/);
  });

  it("requires a digit", () => {
    expect(validatePasswordStrength("Nninfrastru@")).toMatch(/digit/);
  });

  it("requires a symbol", () => {
    expect(validatePasswordStrength("Nninfra20266")).toMatch(/symbol/);
  });
});

describe("password hashing", () => {
  it("never stores the password itself", async () => {
    const hash = await hashPassword("Nninfra@2026");
    expect(hash).not.toContain("Nninfra");
    expect(hash.startsWith("$2")).toBe(true);
  });

  it("salts, so the same password hashes differently each time", async () => {
    const [a, b] = await Promise.all([hashPassword("Nninfra@2026"), hashPassword("Nninfra@2026")]);
    expect(a).not.toBe(b);
  });

  it("verifies the correct password", async () => {
    const hash = await hashPassword("Nninfra@2026");
    expect(await verifyPassword("Nninfra@2026", hash)).toBe(true);
  });

  it("rejects a wrong password", async () => {
    const hash = await hashPassword("Nninfra@2026");
    expect(await verifyPassword("Nninfra@2027", hash)).toBe(false);
  });
});
