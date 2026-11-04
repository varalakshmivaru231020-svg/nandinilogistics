import { actorPayload, apiOk, mobileRoute } from "@/lib/api/mobile";
import { ownIncentives, ownRider, riderPayload, supportContact } from "@/lib/api/mobile-rider";

/**
 * Who the app is signed in as, and what it may show.
 *
 * Called on every cold start. It is how a permission taken away this morning
 * reaches a phone that was signed in last night: the app replaces its cached
 * set with whatever comes back, and a 401 here is its cue to sign in again.
 *
 * `rider` is the caller's own rider record where their login has one — a
 * rider's Draft / Submitted / Rejected status is what their home screen shows.
 * `rider.incentives` is what their companies' sheets have paid them in
 * incentive columns, or null where no sheet has one.
 */
export const GET = mobileRoute([], async (_req, actor) => {
  const [rider, support] = await Promise.all([ownRider(actor.id), supportContact()]);
  return apiOk({
    user: actorPayload(actor),
    rider: rider ? riderPayload(rider, { incentives: await ownIncentives(rider.id) }) : null,
    support,
    serverTime: new Date().toISOString(),
  });
});
