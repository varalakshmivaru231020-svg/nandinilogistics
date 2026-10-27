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
    default: "Nandini Logistics",
    template: "%s · Nandini Logistics",
  },
  description:
    "Rider CRM, onboarding and payout platform for Nandini Logistics.",
};

/**
 * next/font hands back "<family>, <family> Fallback, sans-serif" and injects the
 * metric-overridden fallback in the middle. The design's stack is plain
 * "'Public Sans', sans-serif", and the difference is visible: glyphs neither
 * family carries — ▲ ✓ ✗ — are drawn by whatever comes next, and the adjusted
 * fallback gives them Public Sans's line box instead of the system sans-serif's,
 * which made every pill holding one three pixels shorter than the design's. So
 * the variables carry the loaded family alone, and globals.css adds the
 * design's own fallback after it.
 */
const family = (stack: string) => stack.split(",")[0].trim();

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      style={
        {
          "--font-public-sans": family(publicSans.style.fontFamily),
          "--font-sora": family(sora.style.fontFamily),
        } as React.CSSProperties
      }
    >
      <body className="min-h-full antialiased">{children}</body>
    </html>
  );
}
