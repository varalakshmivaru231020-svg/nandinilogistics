import { MOBILE_LIST_KEYS } from "@/lib/api/mobile-lists";
import { apiOk, mobileRoute } from "@/lib/api/mobile";

/**
 * The lists this boundary serves, so the client can be checked against them
 * rather than against a transcription of them.
 *
 * What each one accepts is in brief §7.24 — the same parameters the web reads
 * from its own URL.
 */
export const GET = mobileRoute([], async () =>
  apiOk({ count: MOBILE_LIST_KEYS.length, lists: MOBILE_LIST_KEYS }),
);
