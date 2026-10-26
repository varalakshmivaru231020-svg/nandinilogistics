import { describe, expect, it } from "vitest";

import { mapsHref, parseHub, parsePayoutColumnMap, payoutColumnMapOf } from "@/lib/companies/hubs";

describe("a company hub", () => {
  it("needs a name, and keeps the rest optional", () => {
    expect(parseHub({ name: "Koramangala hub" })).toEqual({
      name: "Koramangala hub", address: null, latitude: null, longitude: null, mapsUrl: null,
    });
    expect(() => parseHub({ name: " " })).toThrow(/name/);
  });

  it("reads and rounds the coordinates, refusing one without the other", () => {
    const hub = parseHub({ name: "Hub", latitude: "12.93521234567", longitude: "77.62" });
    expect(hub.latitude).toBe(12.935212);
    expect(hub.longitude).toBe(77.62);
    expect(() => parseHub({ name: "Hub", latitude: "12.9" })).toThrow(/both/);
    expect(() => parseHub({ name: "Hub", latitude: "95", longitude: "77" })).toThrow(/Latitude/);
    expect(() => parseHub({ name: "Hub", latitude: "12", longitude: "-181" })).toThrow(/Longitude/);
    expect(() => parseHub({ name: "Hub", latitude: "north", longitude: "77" })).toThrow(/Latitude/);
  });

  it("accepts a Google Maps link only when it is a link", () => {
    expect(parseHub({ name: "Hub", mapsUrl: "https://maps.app.goo.gl/abc" }).mapsUrl).toBe("https://maps.app.goo.gl/abc");
    expect(() => parseHub({ name: "Hub", mapsUrl: "maps.app.goo.gl/abc" })).toThrow(/http/);
  });

  it("opens in Maps from the link, else from the coordinates, else not at all", () => {
    expect(mapsHref({ mapsUrl: "https://x", latitude: 1, longitude: 2 })).toBe("https://x");
    expect(mapsHref({ mapsUrl: null, latitude: "12.9", longitude: "77.6" })).toBe("https://www.google.com/maps?q=12.9,77.6");
    expect(mapsHref({ mapsUrl: null, latitude: null, longitude: null })).toBeNull();
  });
});

describe("the payout sheet column map", () => {
  it("needs the Rider ID and the total, and lets a deduction column be blank", () => {
    const map = parsePayoutColumnMap({ riderCode: "Rider ID", totalPayout: "Total Payout", advance: "Advance", bikeRental: "", tds: "TDS", finalPayout: "Final" });
    expect(map.bikeRental).toBe("");
    expect(() => parsePayoutColumnMap({ totalPayout: "Total" })).toThrow(/Rider ID/);
    expect(() => parsePayoutColumnMap({ riderCode: "Rider ID" })).toThrow(/total/);
  });

  it("refuses one heading feeding two fields, however it is spelt", () => {
    expect(() => parsePayoutColumnMap({ riderCode: "Rider ID", totalPayout: "Total", advance: "TDS", tds: "tds" })).toThrow(/mapped to both/);
  });

  it("reads a stored map back whole, even one saved short", () => {
    expect(payoutColumnMapOf({ riderCode: "ID" })).toEqual({
      riderCode: "ID", totalPayout: "", advance: "", bikeRental: "", tds: "", finalPayout: "",
    });
    expect(payoutColumnMapOf(null).riderCode).toBe("");
  });
});
