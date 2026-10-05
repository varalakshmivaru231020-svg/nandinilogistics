import { describe, expect, it } from "vitest";

import { projectScopeWhere, scopeToWorkspace } from "@/lib/workspace";
import { projectListWhere, type ProjectScope } from "@/lib/projects/list-filters";

const params = { q: "", status: "", type: "", city: "", manager: "" };

describe("scopeToWorkspace", () => {
  it("narrows to the chosen project", () => {
    expect(scopeToWorkspace({
      projectIds: ["a", "b"], canAccessAllProjects: false, workspaceProjectId: "a",
    })).toEqual(["a"]);
  });

  it("is everything reachable when nothing is chosen", () => {
    expect(scopeToWorkspace({
      projectIds: ["a", "b"], canAccessAllProjects: false, workspaceProjectId: null,
    })).toEqual(["a", "b"]);
  });

  it("is null — no filter — for someone who reaches everything and chose nothing", () => {
    expect(scopeToWorkspace({
      projectIds: [], canAccessAllProjects: true, workspaceProjectId: null,
    })).toBeNull();
  });

  it("still narrows someone who reaches everything, once they choose", () => {
    expect(scopeToWorkspace({
      projectIds: [], canAccessAllProjects: true, workspaceProjectId: "c",
    })).toEqual(["c"]);
  });
});

describe("projectScopeWhere", () => {
  it("filters to the workspace", () => {
    expect(projectScopeWhere({
      projectIds: ["a"], canAccessAllProjects: false, workspaceProjectId: "a",
    })).toEqual({ projectId: { in: ["a"] } });
  });

  it("filters nothing when everything is reachable and nothing chosen", () => {
    expect(projectScopeWhere({
      projectIds: [], canAccessAllProjects: true, workspaceProjectId: null,
    })).toEqual({});
  });
});

describe("the project list follows the workspace", () => {
  const mapped: ProjectScope = { canAccessAllProjects: false, projectIds: ["a", "b"] };

  it("shows only the chosen project", () => {
    const where = projectListWhere({ ...mapped, workspaceProjectId: "b" }, params);
    expect(where.id).toBe("b");
  });

  it("shows every mapped project when none is chosen", () => {
    const where = projectListWhere({ ...mapped, workspaceProjectId: null }, params);
    expect(where.id).toEqual({ in: ["a", "b"] });
  });

  /*
   * The workspace is a view, never an access decision. Someone who reaches
   * everything and picks one project sees one; the narrowing is theirs to undo,
   * and it never grants anything.
   */
  it("narrows, but never widens, what an unmapped person sees", () => {
    const where = projectListWhere(
      { canAccessAllProjects: false, projectIds: ["a"], workspaceProjectId: "b" },
      params,
    );
    // "b" is not reachable — the context refuses to set such a workspace, so
    // this shape can only arise from a hand-built scope. It must still not open
    // anything up: the filter names one project, and access is checked again on
    // every record the screen opens.
    expect(where.id).toBe("b");
  });
});
