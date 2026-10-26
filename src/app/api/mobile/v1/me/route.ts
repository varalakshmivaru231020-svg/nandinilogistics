import { actorPayload, apiOk, mobileRoute } from "@/lib/api/mobile";

/**
 * Who the app is signed in as, and what it may show.
 *
 * Called on every cold start. It is how a permission taken away this morning
 * reaches a phone that was signed in last night: the app replaces its cached
 * set with whatever comes back, and a 401 here is its cue to sign in again.
 */
export const GET = mobileRoute([], async (_req, actor) => {
  return apiOk({
    user: actorPayload(actor),
    serverTime: new Date().toISOString(),
  });
});
