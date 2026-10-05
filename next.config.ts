import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // pdfkit reads its standard font metrics from data files beside it at
  // runtime, and exceljs pulls in Node-only modules. Bundled, both break in
  // ways that only surface when someone actually exports a report — so they are
  // loaded from node_modules instead.
  serverExternalPackages: ["pdfkit", "exceljs"],
  experimental: {
    // Every upload in the app goes through a server action, and the storage
    // layer accepts files up to 25 MB. This has to clear that with room for the
    // multipart envelope, or a file the app would happily store is refused by
    // the framework first — with an error the app never sees and cannot
    // explain. src/lib/storage.ts owns the real limit; this only has to be
    // comfortably above it.
    serverActions: { bodySizeLimit: "30mb" },
  },
};

export default nextConfig;
