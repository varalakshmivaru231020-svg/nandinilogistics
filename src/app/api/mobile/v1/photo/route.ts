import { mobileRoute } from "@/lib/api/mobile";
import { ownRider } from "@/lib/api/mobile-rider";
import { photoResponse } from "@/lib/hr/photo-response";

/**
 * The signed-in person's own photograph, for the app's profile and ID card.
 * Only ever their own, so the token is the whole guard beyond `admin.mobile.use`.
 */
export const GET = mobileRoute([], async (_req, actor) => {
  const rider = await ownRider(actor.id);
  return photoResponse(rider?.photoKey);
});
