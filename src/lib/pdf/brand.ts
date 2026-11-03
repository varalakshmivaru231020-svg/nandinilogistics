import { readFile } from "node:fs/promises";
import path from "node:path";

/**
 * The Nandini Logistics letterhead, shared by every PDF the CRM issues —
 * offer letters, payslips. One palette, one logo, one header band, so the
 * documents look like they came from the same office.
 */

// The palette the admin panel uses — navy ink, a muted grey, and the brand
// cyan for rules and accents.
export const PDF = {
  INK: "#22264A",
  NAVY: "#191A5C",
  MUTED: "#7A80A3",
  LINE: "#D4DAEA",
  BRAND: "#0089C9",
  TINT: "#F4F6FB",
  GOOD: "#157F3F",
  WHITE: "#FFFFFF",
} as const;

export const PAGE = { w: 595.28, h: 841.89 };
export const MARGIN = 56;
export const CONTENT_W = PAGE.w - MARGIN * 2;

/** Who issues the document — printed on the letterhead and in the footer. */
export interface Issuer {
  name: string;
  tagline?: string | null;
  addressLine?: string | null;
  phone?: string | null;
  email?: string | null;
  gstin?: string | null;
}

export const DEFAULT_ISSUER: Issuer = { name: "Nandini Logistics", tagline: "Follow your dreams" };

let logoCache: Buffer | null | undefined;
/** The logo from public/, read once; null when the file is missing. */
export async function loadLogo(): Promise<Buffer | null> {
  if (logoCache !== undefined) return logoCache;
  try {
    logoCache = await readFile(path.join(process.cwd(), "public", "nandini-logo.png"));
  } catch {
    logoCache = null;
  }
  return logoCache;
}

/**
 * Draws the header band, the logo on the left and the issuer's particulars
 * on the right, with a rule under them. Returns the y the content may start at.
 */
export function drawLetterhead(doc: PDFKit.PDFDocument, issuer: Issuer, mark: Buffer | null): number {
  const top = 40;
  doc.save().rect(0, 0, PAGE.w, 6).fill(PDF.NAVY).restore();
  doc.save().rect(0, 6, PAGE.w, 2).fill(PDF.BRAND).restore();

  if (mark) {
    doc.image(mark, MARGIN, top, { fit: [150, 60], valign: "center" });
  } else {
    doc.font("Helvetica-Bold").fontSize(20).fillColor(PDF.NAVY).text(issuer.name, MARGIN, top + 14, { lineBreak: false });
  }

  const blockW = 250;
  const x = PAGE.w - MARGIN - blockW;
  doc.font("Helvetica-Bold").fontSize(12).fillColor(PDF.NAVY).text(issuer.name, x, top + 4, { width: blockW, align: "right", lineBreak: false });
  const lines = [
    issuer.tagline,
    issuer.addressLine,
    [issuer.phone, issuer.email].filter(Boolean).join("  ·  "),
    issuer.gstin ? `GSTIN ${issuer.gstin}` : null,
  ].filter((l): l is string => Boolean(l && l.trim()));
  doc.font("Helvetica").fontSize(8.5).fillColor(PDF.MUTED);
  let y = top + 21;
  for (const l of lines) {
    doc.text(l, x, y, { width: blockW, align: "right", lineBreak: false });
    y += 11.5;
  }

  doc.save().moveTo(MARGIN, 112).lineTo(PAGE.w - MARGIN, 112).lineWidth(0.8).strokeColor(PDF.LINE).stroke().restore();
  return 130;
}

/** The footer rule and its two lines, written below the bottom margin. */
export function drawFooter(doc: PDFKit.PDFDocument, left: string, right: string, note: string): void {
  doc.page.margins.bottom = 0;
  const y = PAGE.h - 56;
  doc.save().moveTo(MARGIN, y).lineTo(PAGE.w - MARGIN, y).lineWidth(0.6).strokeColor(PDF.LINE).stroke().restore();
  doc.font("Helvetica").fontSize(7.5).fillColor(PDF.MUTED);
  doc.text(left, MARGIN, y + 8, { width: CONTENT_W / 2, lineBreak: false });
  doc.text(right, MARGIN + CONTENT_W / 2, y + 8, { width: CONTENT_W / 2, align: "right", lineBreak: false });
  doc.text(note, MARGIN, y + 19, { width: CONTENT_W, lineBreak: false });
}
