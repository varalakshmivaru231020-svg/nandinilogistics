import { prisma } from "@/lib/db";
import { projectScopeFilter } from "@/lib/rbac/context";
import { actorPayload, apiOk, mobileRoute } from "@/lib/api/mobile";

/**
 * Who the app is signed in as, and what it may show.
 *
 * Called on every cold start. It is how a permission taken away this morning
 * reaches a phone that was signed in last night: the app replaces its cached
 * set with whatever comes back, and a 401 here is its cue to sign in again.
 *
 * The projects come with it because almost every screen is scoped by one, and
 * the app's project switcher must not be able to offer a project its holder
 * cannot reach.
 */
export const GET = mobileRoute([], async (_req, actor) => {
  const projects = await prisma.project.findMany({
    where: projectScopeFilter(actor, "id"),
    orderBy: { code: "asc" },
    select: { id: true, code: true, name: true, status: true },
  });

  return apiOk({
    user: actorPayload(actor),
    projects,
    serverTime: new Date().toISOString(),
  });
});
