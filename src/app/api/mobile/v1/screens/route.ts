import { SCREEN_KEYS } from "@/lib/screens/registry";
import { NAVIGATION } from "@/lib/navigation";
import { apiOk, mobileRoute } from "@/lib/api/mobile";

/**
 * The navigation, and which screens are described.
 *
 * The sidebar comes from here rather than from a copy in the app: the web's own
 * `NAVIGATION`, in its own order, with its own labels and its own permission on
 * each entry. The app had promoted a dozen sub-screens to top level and the
 * drawer stopped matching the panel — this is so that cannot happen again.
 *
 * Two things are taken out of it on the way:
 *
 *   - an entry marked `webOnly` — Masters & Users, which the brief keeps on the
 *     desk. The app listed it and refused it when tapped;
 *   - an entry whose `anyPermission` this person holds none of. The web's
 *     `visibleNavigation()` has always honoured that and this route did not,
 *     so the drawer could offer a door the page behind it would shut.
 */
export const GET = mobileRoute([], async (_req, actor) =>
  apiOk({
    navigation: NAVIGATION.map((section) => ({
      label: section.label,
      items: section.items
        .filter((i) => !i.webOnly)
        .filter((i) => !i.permission || actor.has(i.permission))
        .filter((i) => !i.anyPermission?.length || i.anyPermission.some((c) => actor.has(c)))
        .map((i) => ({ href: i.href, label: i.label, permission: i.permission ?? null })),
    })).filter((s) => s.items.length > 0),
    screens: SCREEN_KEYS,
  }),
);
