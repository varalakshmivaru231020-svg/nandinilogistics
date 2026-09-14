import "server-only";

import { redirect } from "next/navigation";

import type { AuthContext } from "@/lib/rbac/context";
import { assertProjectAccess, PermissionError } from "@/lib/rbac/guard";

/**
 * For print pages: a record on a project the user is not mapped to sends them
 * to the access-denied screen, naming the permission that would have let them in.
 */
export function requirePrintProjectAccess(ctx: AuthContext, projectId: string | null | undefined): void {
  try {
    assertProjectAccess(ctx, projectId);
  } catch (err) {
    if (err instanceof PermissionError) redirect(`/forbidden?code=${encodeURIComponent(err.code)}`);
    throw err;
  }
}
