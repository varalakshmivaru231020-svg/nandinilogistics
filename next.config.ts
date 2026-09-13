import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // pdfkit reads its standard font metrics from data files beside it at
  // runtime, and exceljs pulls in Node-only modules. Bundled, both break in
  // ways that only surface when someone actually exports a report — so they are
  // loaded from node_modules instead.
  serverExternalPackages: ["pdfkit", "exceljs"],
  experimental: {
    // Imports upload a spreadsheet through a server action. The 1 MB default
    // refuses a real lead list; the parser itself caps files at 4 MB.
    serverActions: { bodySizeLimit: "5mb" },
  },
};

export default nextConfig;
