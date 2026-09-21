import "server-only";

import { cookies } from "next/headers";

/**
 * The project someone is working in.
 *
 * A workspace is a *view*, not a permission. It narrows what the screens show
 * so that a person working on one site is not reading five sites' indents, but
 * it never widens or narrows what they may reach: opening another project's
 * record by link still works, and access is still decided by projectIds alone.
 * Keeping the two apart matters — if this were folded into access control, a
 * bug here would become a security bug rather than a filtering one.
 *
 * It is optional. "All projects" is a real answer, chosen at sign-in or later,
 * and the chooser can be skipped.
 */
export const WORKSPACE_COOKIE = "nn_workspace";

/** Marks that the chooser has been answered, including by skipping it. */
export const WORKSPACE_ASKED_COOKIE = "nn_workspace_asked";

const YEAR = 60 * 60 * 24 * 365;

/** The project id chosen in this browser, or null for all projects. */
export async function readWorkspaceCookie(): Promise<string | null> {
  const jar = await cookies();
  const value = jar.get(WORKSPACE_COOKIE)?.value?.trim();
  return value ? value : null;
}

/** Whether the chooser has been answered at all — skipping counts. */
export async function workspaceAsked(): Promise<boolean> {
  const jar = await cookies();
  return jar.get(WORKSPACE_ASKED_COOKIE)?.value === "1";
}

export async function writeWorkspaceCookie(projectId: string | null): Promise<void> {
  const jar = await cookies();
  if (projectId) {
    jar.set(WORKSPACE_COOKIE, projectId, { httpOnly: true, sameSite: "lax", path: "/", maxAge: YEAR });
  } else {
    jar.delete(WORKSPACE_COOKIE);
  }
  jar.set(WORKSPACE_ASKED_COOKIE, "1", { httpOnly: true, sameSite: "lax", path: "/", maxAge: YEAR });
}

/**
 * The project ids a screen should show, given what the person may reach and
 * what they have chosen to look at.
 *
 * Returns null for "everything you may reach" — which is what a screen wants
 * when there is no workspace and the person may access all projects.
 */
export function scopeToWorkspace(
  scope: { projectIds: string[]; canAccessAllProjects: boolean; workspaceProjectId: string | null },
): string[] | null {
  const { projectIds, canAccessAllProjects, workspaceProjectId } = scope;
  if (workspaceProjectId) return [workspaceProjectId];
  return canAccessAllProjects ? null : projectIds;
}

/** The Prisma fragment for a model with a `projectId`, workspace included. */
export function projectScopeWhere(
  scope: { projectIds: string[]; canAccessAllProjects: boolean; workspaceProjectId: string | null },
): { projectId?: { in: string[] } } {
  const ids = scopeToWorkspace(scope);
  return ids === null ? {} : { projectId: { in: ids } };
}
