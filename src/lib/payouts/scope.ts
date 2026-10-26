import "server-only";

import type { Prisma, PrismaClient } from "@prisma/client";

import type { AuthContext } from "@/lib/rbac/context";
import { PERM } from "@/lib/permissions/codes";

type Db = PrismaClient | Prisma.TransactionClient;

/**
 * Whose money a person may see — SOW §3.4 and §3.7.
 *
 *   Admin (viewAll)     every rider's.
 *   Team Leader         the riders of the companies assigned to them.
 *   Tele-caller         the riders whose lead they own — the ones they onboarded.
 *   Rider               their own, and nothing else.
 *
 * Resolved once per request from the database, then applied as a pure `where`
 * on Employee by `employeeScopeWhere`, so the payout list, the advance list and
 * their exports narrow the same way.
 */
export type ViewerScope =
  | { kind: "all" }
  | { kind: "team"; companyIds: string[] }
  | { kind: "onboarded"; userId: string }
  | { kind: "self"; employeeId: string }
  | { kind: "none" };

export async function resolveViewerScope(db: Db, ctx: AuthContext, viewAllCode: string): Promise<ViewerScope> {
  if (ctx.has(viewAllCode)) return { kind: "all" };

  const [led, own] = await Promise.all([
    db.companyTeamLeader.findMany({ where: { userId: ctx.id }, select: { companyId: true } }),
    db.employee.findFirst({ where: { userId: ctx.id }, select: { id: true } }),
  ]);
  if (led.length > 0) return { kind: "team", companyIds: led.map((c) => c.companyId) };
  if (own) return { kind: "self", employeeId: own.id };
  if (ctx.has(PERM.sales.lead.receiveAssignment)) return { kind: "onboarded", userId: ctx.id };
  return { kind: "none" };
}

/** The scope as a `where` on Employee. Pure. */
export function employeeScopeWhere(scope: ViewerScope): Record<string, unknown> {
  switch (scope.kind) {
    case "all":
      return {};
    case "team":
      return { companies: { some: { companyId: { in: scope.companyIds } } } };
    case "onboarded":
      return { lead: { ownerId: scope.userId } };
    case "self":
      return { id: scope.employeeId };
    case "none":
      return { id: "__nobody__" };
  }
}

/** What the scope amounts to, in words, for an export's header. */
export function describeScope(scope: ViewerScope): string | null {
  switch (scope.kind) {
    case "all": return null;
    case "team": return "Your team";
    case "onboarded": return "Riders you onboarded";
    case "self": return "Your own";
    case "none": return "Nothing in view";
  }
}
