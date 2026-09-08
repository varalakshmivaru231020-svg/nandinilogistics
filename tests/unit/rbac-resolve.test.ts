import { describe, expect, it } from "vitest";

import { resolveEffectivePermissions, type RoleInput } from "@/lib/rbac/resolve";

function role(over: Partial<RoleInput> = {}): RoleInput {
  return {
    id: "r1", code: "ROLE", name: "Role", level: 100, status: "ACTIVE",
    permissionCodes: [], approvalLimits: [], ...over,
  };
}

describe("permission resolution", () => {
  it("unions the permissions of every role held", () => {
    const { granted } = resolveEffectivePermissions(
      [
        role({ id: "a", permissionCodes: ["x.y.view", "x.y.create"] }),
        role({ id: "b", permissionCodes: ["x.y.create", "x.z.view"] }),
      ],
      [],
    );
    expect([...granted].sort()).toEqual(["x.y.create", "x.y.view", "x.z.view"]);
  });

  it("ignores permissions carried by an inactive role", () => {
    const { granted } = resolveEffectivePermissions(
      [
        role({ id: "a", status: "ACTIVE", permissionCodes: ["kept.a.view"] }),
        role({ id: "b", status: "INACTIVE", permissionCodes: ["dropped.b.view"] }),
      ],
      [],
    );
    expect(granted.has("kept.a.view")).toBe(true);
    expect(granted.has("dropped.b.view")).toBe(false);
  });

  it("adds a permission granted directly to the user", () => {
    const { granted } = resolveEffectivePermissions(
      [role({ permissionCodes: ["x.y.view"] })],
      [{ code: "x.y.delete", effect: "ALLOW" }],
    );
    expect(granted.has("x.y.delete")).toBe(true);
  });

  it("removes a role permission the user is explicitly denied", () => {
    const { granted } = resolveEffectivePermissions(
      [role({ permissionCodes: ["x.y.view", "x.y.delete"] })],
      [{ code: "x.y.delete", effect: "DENY" }],
    );
    expect(granted.has("x.y.view")).toBe(true);
    expect(granted.has("x.y.delete")).toBe(false);
  });

  it("lets DENY beat ALLOW on the same code, whatever the order", () => {
    const forwards = resolveEffectivePermissions([role()], [
      { code: "x.y.z", effect: "ALLOW" },
      { code: "x.y.z", effect: "DENY" },
    ]);
    const backwards = resolveEffectivePermissions([role()], [
      { code: "x.y.z", effect: "DENY" },
      { code: "x.y.z", effect: "ALLOW" },
    ]);
    expect(forwards.granted.has("x.y.z")).toBe(false);
    expect(backwards.granted.has("x.y.z")).toBe(false);
  });

  it("grants nothing to a user with no roles and no overrides", () => {
    expect(resolveEffectivePermissions([], []).granted.size).toBe(0);
  });

  it("reports only the active roles it used", () => {
    const { roles } = resolveEffectivePermissions(
      [role({ id: "a" }), role({ id: "b", status: "INACTIVE" })],
      [],
    );
    expect(roles.map((r) => r.id)).toEqual(["a"]);
  });
});

describe("approval ceilings", () => {
  it("takes the most generous ceiling across roles", () => {
    const { approvalLimits } = resolveEffectivePermissions(
      [
        role({ id: "a", approvalLimits: [{ scope: "material.indent", maxValue: 200_000 }] }),
        role({ id: "b", approvalLimits: [{ scope: "material.indent", maxValue: 500_000 }] }),
      ],
      [],
    );
    expect(approvalLimits["material.indent"]).toBe(500_000);
  });

  it("lets a personal limit replace the role ceiling, even downwards", () => {
    const { approvalLimits } = resolveEffectivePermissions(
      [role({ approvalLimits: [{ scope: "material.indent", maxValue: 500_000 }] })],
      [],
      [{ scope: "material.indent", maxValue: 100_000 }],
    );
    expect(approvalLimits["material.indent"]).toBe(100_000);
  });

  it("ignores a ceiling attached to an inactive role", () => {
    const { approvalLimits } = resolveEffectivePermissions(
      [role({ status: "INACTIVE", approvalLimits: [{ scope: "material.po", maxValue: 999 }] })],
      [],
    );
    expect(approvalLimits["material.po"]).toBeUndefined();
  });

  it("keeps ceilings for different chains apart", () => {
    const { approvalLimits } = resolveEffectivePermissions(
      [role({ approvalLimits: [
        { scope: "material.indent", maxValue: 500_000 },
        { scope: "sales.discount", maxValue: 200_000 },
      ] })],
      [],
    );
    expect(approvalLimits["material.indent"]).toBe(500_000);
    expect(approvalLimits["sales.discount"]).toBe(200_000);
  });
});
