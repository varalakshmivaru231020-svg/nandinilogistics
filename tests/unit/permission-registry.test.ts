import { describe, expect, it } from "vitest";

import {
  MODULES, PERMISSIONS, PERMISSION_CODES, getPermission,
  permissionGroups, permissionsByModule,
} from "@/lib/permissions/registry";
import { PERM } from "@/lib/permissions/codes";
import { MASTERS, masterPerm } from "@/lib/masters/registry";
import { NAVIGATION, visibleNavigation } from "@/lib/navigation";
import { REPORTS } from "@/lib/reports";

/**
 * These guard the one rule of the codebase: nothing guarded ships without a
 * permission registered first. A feature added without its permission fails
 * here rather than in front of a user.
 */

describe("permission registry integrity", () => {
  it("has no duplicate codes", () => {
    const seen = new Set<string>();
    const dupes: string[] = [];
    for (const c of PERMISSION_CODES) {
      if (seen.has(c)) dupes.push(c);
      seen.add(c);
    }
    expect(dupes).toEqual([]);
  });

  it("uses a three-part module.resource.action code everywhere", () => {
    const malformed = PERMISSIONS.filter((p) => p.code.split(".").length !== 3);
    expect(malformed.map((p) => p.code)).toEqual([]);
  });

  it("keeps each code consistent with its own module, resource and action", () => {
    const mismatched = PERMISSIONS.filter(
      (p) => p.code !== `${p.module}.${p.resource}.${p.action}`,
    );
    expect(mismatched.map((p) => p.code)).toEqual([]);
  });

  it("declares every module a permission refers to", () => {
    const known = new Set(MODULES.map((m) => m.key));
    const orphans = [...new Set(PERMISSIONS.map((p) => p.module))].filter((m) => !known.has(m));
    expect(orphans).toEqual([]);
  });

  it("gives every permission a label and a group", () => {
    const bare = PERMISSIONS.filter((p) => !p.label?.trim() || !p.group?.trim());
    expect(bare.map((p) => p.code)).toEqual([]);
  });

  it("only uses the six known kinds", () => {
    const allowed = new Set(["PAGE", "TAB", "ACTION", "BUTTON", "FIELD", "REPORT"]);
    const odd = PERMISSIONS.filter((p) => !allowed.has(p.kind));
    expect(odd.map((p) => `${p.code}:${p.kind}`)).toEqual([]);
  });

  it("resolves every code through getPermission", () => {
    for (const code of PERMISSION_CODES) {
      expect(getPermission(code), code).toBeDefined();
    }
  });

  it("groups every permission exactly once", () => {
    const grouped = permissionGroups().reduce((s, g) => s + g.permissions.length, 0);
    expect(grouped).toBe(PERMISSIONS.length);
  });
});

describe("generated PERM tree", () => {
  it("mirrors the registry exactly", () => {
    const fromTree = new Set<string>();
    for (const resources of Object.values(PERM)) {
      for (const actions of Object.values(resources)) {
        for (const code of Object.values(actions)) fromTree.add(code as string);
      }
    }
    expect(fromTree.size).toBe(PERMISSIONS.length);
    for (const code of PERMISSION_CODES) {
      expect(fromTree.has(code), `${code} missing from generated codes.ts`).toBe(true);
    }
  });

  it("is regenerated whenever the registry changes", () => {
    // If this fails, run `pnpm perms:codegen`.
    const treeCount = Object.values(PERM).reduce(
      (s, resources) =>
        s + Object.values(resources).reduce((n, actions) => n + Object.keys(actions).length, 0),
      0,
    );
    expect(treeCount).toBe(PERMISSIONS.length);
  });
});

describe("every guarded surface has its permission", () => {
  it("registers the full CRUD set for all 22 masters", () => {
    const missing: string[] = [];
    for (const master of MASTERS) {
      for (const action of ["view", "create", "update", "delete", "export", "toggleStatus"]) {
        const code = masterPerm(master, action);
        if (!PERMISSION_CODES.includes(code)) missing.push(code);
      }
    }
    expect(missing).toEqual([]);
  });

  it("registers a permission behind every navigation entry", () => {
    const missing: string[] = [];
    for (const section of NAVIGATION) {
      for (const item of section.items) {
        for (const code of [item.permission, ...(item.anyPermission ?? [])].filter(Boolean)) {
          if (!PERMISSION_CODES.includes(code as string)) missing.push(`${item.href} → ${code}`);
        }
      }
    }
    expect(missing).toEqual([]);
  });

  it("registers view and export for every report", () => {
    const missing: string[] = [];
    for (const r of REPORTS) {
      for (const action of ["view", "export"]) {
        const code = `reports.${r.key}.${action}`;
        if (!PERMISSION_CODES.includes(code)) missing.push(code);
      }
    }
    expect(missing).toEqual([]);
  });

  it("has a report implementation for every reports.*.view permission", () => {
    const implemented = new Set(REPORTS.map((r) => r.key));
    const declared = permissionsByModule("reports")
      .filter((p) => p.action === "view")
      .map((p) => p.resource);
    expect(declared.filter((k) => !implemented.has(k))).toEqual([]);
  });
});

describe("navigation is a projection of the permission set", () => {
  it("shows nothing to a principal with no permissions", () => {
    expect(visibleNavigation(() => false)).toEqual([]);
  });

  it("shows every section to a principal with all of them", () => {
    const visible = visibleNavigation(() => true);
    expect(visible.length).toBe(NAVIGATION.length);
  });

  it("hides an item whose permission is withheld", () => {
    const withoutLeads = visibleNavigation((c) => c !== PERM.sales.lead.view);
    const hrefs = withoutLeads.flatMap((s) => s.items.map((i) => i.href));
    expect(hrefs).not.toContain("/sales/leads");
  });
});

describe("tasks and checklists", () => {
  it("registers their permissions", () => {
    expect(permissionsByModule("task").length).toBeGreaterThan(0);
    expect(permissionsByModule("checklist").length).toBeGreaterThan(0);
  });

  it("keeps them in the navigation, where the design draws them", () => {
    const hrefs = visibleNavigation(() => true).flatMap((s) => s.items.map((i) => i.href));
    expect(hrefs).toContain("/tasks");
    expect(hrefs).toContain("/checklists");
  });
});
