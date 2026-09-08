import type { Metadata } from "next";
import { Public_Sans, Sora } from "next/font/google";

import "./globals.css";

/**
 * The design's two families, self-hosted by next/font so there is no external
 * request and no flash of unstyled text.
 */
const publicSans = Public_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-public-sans",
  display: "swap",
});

const sora = Sora({
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
  variable: "--font-sora",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "NN Infra ERP",
    template: "%s · NN Infra ERP",
  },
  description:
    "Construction & Real Estate ERP and Sales CRM for NN Infrastructure Developers — projects, material, sales, one system of record.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${publicSans.variable} ${sora.variable}`}>
      <body className="min-h-full antialiased">{children}</body>
    </html>
  );
}
