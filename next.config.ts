import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // pdfkit reads its standard font metrics from data files beside it at
  // runtime, and exceljs pulls in Node-only modules. Bundled, both break in
  // ways that only surface when someone actually exports a report — so they are
  // loaded from node_modules instead.
  serverExternalPackages: ["pdfkit", "exceljs"],
};

export default nextConfig;
