/**
 * A client company's hubs and payout sheet mapping — the rules, pure.
 *
 * SOW §3.3: a company has several locations, each with a Google Maps
 * position, and a column mapping for its payout sheet (§3.4). The database
 * side is in src/app/(app)/companies/actions.ts; the checks live here so the
 * form, the action and the tests cannot disagree about what a hub is.
 */

export interface HubInput {
  name: string;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  mapsUrl: string | null;
}

const text = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

function coordinate(raw: string, label: string, limit: number): number | null {
  if (raw === "") return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || Math.abs(n) > limit) {
    throw new Error(`${label} must be a number between -${limit} and ${limit}.`);
  }
  return Math.round(n * 1_000_000) / 1_000_000;
}

/**
 * Reads a hub out of a form, refusing what cannot be a hub: no name, a
 * latitude off the planet, a maps link that is not a link, or one coordinate
 * without the other.
 */
export function parseHub(form: Record<string, unknown>): HubInput {
  const name = text(form.name);
  if (name.length < 2) throw new Error("Give the hub a name.");

  const latitude = coordinate(text(form.latitude), "Latitude", 90);
  const longitude = coordinate(text(form.longitude), "Longitude", 180);
  if ((latitude === null) !== (longitude === null)) {
    throw new Error("Give both the latitude and the longitude, or neither.");
  }

  const mapsUrl = text(form.mapsUrl);
  if (mapsUrl && !/^https?:\/\/\S+$/i.test(mapsUrl)) {
    throw new Error("The Google Maps link must start with http:// or https://.");
  }

  return {
    name,
    address: text(form.address) || null,
    latitude,
    longitude,
    mapsUrl: mapsUrl || null,
  };
}

/** Where "Open in Maps" goes: the link given, or one built from the coordinates. */
export function mapsHref(hub: { mapsUrl: string | null; latitude: unknown; longitude: unknown }): string | null {
  if (hub.mapsUrl) return hub.mapsUrl;
  if (hub.latitude === null || hub.latitude === undefined || hub.longitude === null || hub.longitude === undefined) {
    return null;
  }
  return `https://www.google.com/maps?q=${Number(hub.latitude)},${Number(hub.longitude)}`;
}

/* --------------------------- payout column mapping ------------------------ */

export const PAYOUT_FIELDS = ["riderCode", "totalPayout", "advance", "bikeRental", "tds", "finalPayout"] as const;
export type PayoutField = (typeof PAYOUT_FIELDS)[number];

export const PAYOUT_FIELD_LABEL: Record<PayoutField, string> = {
  riderCode: "Rider ID",
  totalPayout: "Total payout",
  advance: "Advance amount",
  bikeRental: "Bike rental",
  tds: "TDS",
  finalPayout: "Final payout",
};

export type PayoutColumnMap = Record<PayoutField, string>;

/**
 * Reads the six header names out of the form. The Rider ID and the total are
 * always needed; the deductions may be blank — a monthly staff sheet has no
 * bike rental column — and a header may not feed two fields.
 */
export function parsePayoutColumnMap(form: Record<string, unknown>): PayoutColumnMap {
  const map = Object.fromEntries(PAYOUT_FIELDS.map((f) => [f, text(form[f])])) as PayoutColumnMap;
  if (!map.riderCode) throw new Error("Name the column that carries the Rider ID.");
  if (!map.totalPayout) throw new Error("Name the column that carries the total payout.");
  const seen = new Map<string, PayoutField>();
  for (const f of PAYOUT_FIELDS) {
    const key = map[f].toLowerCase().replace(/[^a-z0-9]+/g, "");
    if (!key) continue;
    const other = seen.get(key);
    if (other) {
      throw new Error(`"${map[f]}" is mapped to both ${PAYOUT_FIELD_LABEL[other]} and ${PAYOUT_FIELD_LABEL[f]}.`);
    }
    seen.set(key, f);
  }
  return map;
}

/** A stored map, with every field present even when the row was saved short. */
export function payoutColumnMapOf(stored: unknown): PayoutColumnMap {
  const raw = (stored && typeof stored === "object" ? stored : {}) as Record<string, unknown>;
  return Object.fromEntries(PAYOUT_FIELDS.map((f) => [f, text(raw[f])])) as PayoutColumnMap;
}
