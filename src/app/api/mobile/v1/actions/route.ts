import { MOBILE_ACTIONS } from "@/lib/api/mobile-actions";
import { apiOk, mobileRoute } from "@/lib/api/mobile";

/**
 * Every action the app may call, and the arguments each one takes.
 *
 * The client generates its call sites from this rather than transcribing them,
 * for the same reason the web generates `PERM` from the permission registry
 * instead of writing string literals: a signature that changes should break the
 * build, not a button.
 *
 * It is also what the app's own test suite checks itself against — if an
 * argument is added here and the app still sends the old list, the boundary
 * answers 422 with the name of the argument it is missing.
 */
export const GET = mobileRoute([], async () =>
  apiOk({
    count: Object.keys(MOBILE_ACTIONS).length,
    actions: Object.fromEntries(
      Object.entries(MOBILE_ACTIONS).map(([key, def]) => [key, def.args]),
    ),
  }),
);
