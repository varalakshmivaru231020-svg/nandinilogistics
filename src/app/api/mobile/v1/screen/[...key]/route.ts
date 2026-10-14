import { resolveScreen } from "@/lib/screens/resolve";
import { apiFail, apiOk, mobileRoute } from "@/lib/api/mobile";

/**
 * How one module's screen is laid out, in the web's own words.
 *
 *   GET /api/mobile/v1/screen/material/vendors
 *
 * The client renders its search box and its filter sheet from this rather than
 * from its own idea of them, so a label, an option or a parameter name cannot
 * differ between the two. It is also how a filter added to a web screen reaches
 * the phone without the app being rebuilt.
 */
export const GET = mobileRoute([], async (req, actor) => {
  const key = new URL(req.url).pathname.split("/screen/")[1]?.replace(/\/$/, "") ?? "";
  const screen = await resolveScreen(actor, key);
  if (!screen) return apiFail(404, `No such screen: ${key}`, "unknown-screen");
  return apiOk(screen);
});
