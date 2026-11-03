import { readFile } from "node:fs/promises";
import path from "node:path";

import PDFDocument from "pdfkit";

/**
 * The offer letter — SOW §3.2: a template from Masters with the rider's
 * details merged in, produced as a PDF on acceptance.
 *
 * `mergeOfferLetter` is pure, so what the letter says can be asserted; the
 * PDF is only the rendering of that text — on a Nandini Logistics letterhead,
 * with the addressee block, a salary annexure for staff, and a signature
 * block, none of which the template has to carry.
 */

export interface OfferLetterFacts {
  name: string;
  riderId: string;
  company: string;
  /** Already formatted, as the letter should print it. */
  joiningDate: string;
  rateCard: string;
  /** Staff only — "Rs. 18,000", already formatted. Empty for a rider. */
  salary?: string;
  designation?: string;
}

const PLACEHOLDERS: Array<[token: string, key: keyof OfferLetterFacts]> = [
  ["name", "name"],
  ["riderId", "riderId"],
  ["employeeId", "riderId"],
  ["company", "company"],
  ["joiningDate", "joiningDate"],
  ["rateCard", "rateCard"],
  ["salary", "salary"],
  ["designation", "designation"],
];

/**
 * Replaces every {{placeholder}} in the subject and body. Whitespace inside
 * the braces is tolerated — "{{ name }}" — and an unknown placeholder is left
 * as it is, so a typo in a template shows up in the letter rather than
 * silently vanishing.
 */
export function mergeOfferLetter(
  template: { subject: string; body: string },
  facts: OfferLetterFacts,
): { subject: string; body: string } {
  const merge = (text: string) =>
    PLACEHOLDERS.reduce(
      (out, [token, key]) => out.replace(new RegExp(`\\{\\{\\s*${token}\\s*\\}\\}`, "g"), facts[key] ?? ""),
      text,
    );
  return { subject: merge(template.subject), body: merge(template.body) };
}

/** Who issues the letter — printed on the letterhead and in the footer. */
export interface LetterIssuer {
  name: string;
  tagline?: string | null;
  addressLine?: string | null;
  phone?: string | null;
  email?: string | null;
  gstin?: string | null;
}

/** One line of the salary annexure. */
export interface SalaryLine {
  label: string;
  monthly: number;
  /** Deductions are shown in brackets and subtracted. */
  deduction?: boolean;
}

export interface OfferLetterMeta {
  riderId: string;
  generatedAt: Date;
  /** The person the letter is addressed to. */
  addressee: { name: string; designation?: string | null; address?: string | null; mobile?: string | null };
  issuer?: LetterIssuer;
  /** Staff only: the annexure. Riders are paid by rate card and get none. */
  salary?: { lines: SalaryLine[]; note?: string } | null;
  /** The title of whoever signs. */
  signatory?: string;
}

const LETTERHEAD = "Nandini Logistics";
const DEFAULT_ISSUER: LetterIssuer = { name: LETTERHEAD, tagline: "Follow your dreams" };

// The palette the admin panel uses — navy ink, a muted grey, and the brand
// cyan for rules and accents.
const INK = "#22264A";
const NAVY = "#191A5C";
const MUTED = "#7A80A3";
const LINE = "#D4DAEA";
const BRAND = "#0089C9";
const TINT = "#F4F6FB";

const PAGE = { w: 595.28, h: 841.89 };
const MARGIN = 56;
const CONTENT_W = PAGE.w - MARGIN * 2;

/** pdfkit's built-in Helvetica has no ₹. */
export function pdfSafe(text: string): string {
  return text.replace(/₹\s?/g, "Rs. ");
}

/** 18,000.00 the Indian way, without the symbol — the caller adds "Rs.". */
export function inr(n: number): string {
  return n.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function longDate(d: Date): string {
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric" });
}

let logoCache: Buffer | null | undefined;
async function logo(): Promise<Buffer | null> {
  if (logoCache !== undefined) return logoCache;
  try {
    logoCache = await readFile(path.join(process.cwd(), "public", "nandini-logo.png"));
  } catch {
    logoCache = null;
  }
  return logoCache;
}

/** The merged letter as an A4 PDF on the letterhead. */
export async function renderOfferLetterPdf(
  letter: { subject: string; body: string },
  meta: OfferLetterMeta,
): Promise<Buffer> {
  const issuer = meta.issuer ?? DEFAULT_ISSUER;
  const mark = await logo();

  const doc = new PDFDocument({
    size: "A4",
    margins: { top: 150, bottom: 84, left: MARGIN, right: MARGIN },
    bufferPages: true,
    info: { Title: letter.subject, Author: issuer.name, Subject: `Offer letter · ${meta.riderId}`, CreationDate: meta.generatedAt },
  });

  const chunks: Buffer[] = [];
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });

  /* ---------------------------------------------------------- letterhead */
  const letterhead = () => {
    const top = 40;
    // A slim brand band along the top edge.
    doc.save().rect(0, 0, PAGE.w, 6).fill(NAVY).restore();
    doc.save().rect(0, 6, PAGE.w, 2).fill(BRAND).restore();

    if (mark) {
      doc.image(mark, MARGIN, top, { fit: [150, 60], valign: "center" });
    } else {
      doc.font("Helvetica-Bold").fontSize(20).fillColor(NAVY).text(issuer.name, MARGIN, top + 14, { lineBreak: false });
    }

    // The issuer's particulars, right-aligned beside the mark.
    const blockW = 250;
    const x = PAGE.w - MARGIN - blockW;
    doc.font("Helvetica-Bold").fontSize(12).fillColor(NAVY).text(issuer.name, x, top + 4, { width: blockW, align: "right", lineBreak: false });
    const lines = [issuer.tagline, issuer.addressLine, [issuer.phone, issuer.email].filter(Boolean).join("  ·  "), issuer.gstin ? `GSTIN ${issuer.gstin}` : null]
      .filter((l): l is string => Boolean(l && l.trim()));
    doc.font("Helvetica").fontSize(8.5).fillColor(MUTED);
    let y = top + 21;
    for (const l of lines) {
      doc.text(l, x, y, { width: blockW, align: "right", lineBreak: false });
      y += 11.5;
    }

    doc.save().moveTo(MARGIN, 112).lineTo(PAGE.w - MARGIN, 112).lineWidth(0.8).strokeColor(LINE).stroke().restore();
  };

  const footer = (page: number, pages: number) => {
    // Written below the bottom margin on purpose — with the margin lifted,
    // or pdfkit would start a new page for each line.
    doc.page.margins.bottom = 0;
    const y = PAGE.h - 56;
    doc.save().moveTo(MARGIN, y).lineTo(PAGE.w - MARGIN, y).lineWidth(0.6).strokeColor(LINE).stroke().restore();
    doc.font("Helvetica").fontSize(7.5).fillColor(MUTED);
    doc.text(`${issuer.name} · Offer letter · ${meta.riderId}`, MARGIN, y + 8, { width: CONTENT_W / 2, lineBreak: false });
    doc.text(`Page ${page} of ${pages}`, MARGIN + CONTENT_W / 2, y + 8, { width: CONTENT_W / 2, align: "right", lineBreak: false });
    doc.text("System-generated on the Nandini Rider CRM. Valid without a seal when signed.", MARGIN, y + 19, { width: CONTENT_W, lineBreak: false });
  };

  doc.on("pageAdded", letterhead);
  letterhead();

  /* ------------------------------------------------------- reference line */
  doc.y = 130;
  doc.font("Helvetica").fontSize(9.5).fillColor(MUTED);
  const ref = `Ref: NL/OL/${meta.riderId}`;
  doc.text(ref, MARGIN, doc.y, { continued: true, lineBreak: false });
  doc.text(`Date: ${longDate(meta.generatedAt)}`, { align: "right" });
  doc.moveDown(1.4);

  /* ------------------------------------------------------------ addressee */
  doc.font("Helvetica").fontSize(9).fillColor(MUTED).text("To,", MARGIN, doc.y);
  doc.font("Helvetica-Bold").fontSize(11.5).fillColor(INK).text(pdfSafe(meta.addressee.name), MARGIN, doc.y);
  const who = [meta.addressee.designation, `ID ${meta.riderId}`].filter(Boolean).join("  ·  ");
  doc.font("Helvetica").fontSize(9.5).fillColor(MUTED).text(who, MARGIN, doc.y);
  if (meta.addressee.address) doc.text(pdfSafe(meta.addressee.address), MARGIN, doc.y, { width: CONTENT_W * 0.7 });
  if (meta.addressee.mobile) doc.text(`Mobile: ${meta.addressee.mobile}`, MARGIN, doc.y);
  doc.moveDown(1.3);

  /* -------------------------------------------------------------- subject */
  const subjectY = doc.y;
  const subject = pdfSafe(letter.subject);
  const subjectH = doc.font("Helvetica-Bold").fontSize(12.5).heightOfString(subject, { width: CONTENT_W - 28 }) + 18;
  doc.save().roundedRect(MARGIN, subjectY, CONTENT_W, subjectH, 6).fill(TINT).restore();
  doc.save().rect(MARGIN, subjectY, 3, subjectH).fill(BRAND).restore();
  doc.font("Helvetica-Bold").fontSize(12.5).fillColor(NAVY).text(subject, MARGIN + 14, subjectY + 9, { width: CONTENT_W - 28 });
  doc.y = subjectY + subjectH;
  doc.moveDown(1.2);

  /* ----------------------------------------------------------------- body */
  doc.font("Helvetica").fontSize(10.5).fillColor(INK);
  const paragraphs = letter.body.split(/\r?\n/);
  for (const paragraph of paragraphs) {
    const text = pdfSafe(paragraph);
    if (text.trim() === "") {
      doc.moveDown(0.7);
      continue;
    }
    // A line that starts with "-" or "•" is a bullet in the template.
    const bullet = /^\s*[-•]\s+/.test(text);
    if (bullet) {
      const y = doc.y;
      doc.text("•", MARGIN + 8, y, { lineBreak: false });
      doc.text(text.replace(/^\s*[-•]\s+/, ""), MARGIN + 22, y, { width: CONTENT_W - 22, align: "left", lineGap: 2 });
    } else {
      doc.text(text, MARGIN, doc.y, { width: CONTENT_W, align: "justify", lineGap: 2.5 });
    }
  }

  /* -------------------------------------------------------- salary annexure */
  if (meta.salary && meta.salary.lines.length) {
    const rowH = 18;
    const needed = rowH * (meta.salary.lines.length + 3) + 70;
    if (doc.y + needed > PAGE.h - 100) doc.addPage();
    doc.moveDown(0.9);
    doc.font("Helvetica-Bold").fontSize(11).fillColor(NAVY).text("Annexure A — Salary structure", MARGIN, doc.y);
    doc.font("Helvetica").fontSize(8.5).fillColor(MUTED).text("Figures are per month. Deductions are shown in brackets.");
    doc.moveDown(0.6);

    const colW = [CONTENT_W - 150 - 150, 150, 150];
    const x0 = MARGIN;
    let y = doc.y;
    const header = ["Component", "Monthly (Rs.)", "Annual (Rs.)"];
    doc.save().rect(x0, y, CONTENT_W, rowH).fill(NAVY).restore();
    doc.font("Helvetica-Bold").fontSize(9).fillColor("#FFFFFF");
    header.forEach((h, i) => {
      const x = x0 + colW.slice(0, i).reduce((a, b) => a + b, 0);
      doc.text(h, x + 10, y + 6, { width: colW[i] - 20, align: i === 0 ? "left" : "right", lineBreak: false });
    });
    y += rowH;

    let net = 0;
    meta.salary.lines.forEach((l, idx) => {
      const amount = l.deduction ? -l.monthly : l.monthly;
      net += amount;
      if (idx % 2 === 1) doc.save().rect(x0, y, CONTENT_W, rowH).fill(TINT).restore();
      doc.font("Helvetica").fontSize(9.5).fillColor(INK);
      doc.text(l.label, x0 + 10, y + 6, { width: colW[0] - 20, lineBreak: false });
      const m = l.deduction ? `(${inr(l.monthly)})` : inr(l.monthly);
      const a = l.deduction ? `(${inr(l.monthly * 12)})` : inr(l.monthly * 12);
      doc.text(m, x0 + colW[0] + 10, y + 6, { width: colW[1] - 20, align: "right", lineBreak: false });
      doc.text(a, x0 + colW[0] + colW[1] + 10, y + 6, { width: colW[2] - 20, align: "right", lineBreak: false });
      y += rowH;
    });

    doc.save().moveTo(x0, y).lineTo(x0 + CONTENT_W, y).lineWidth(0.8).strokeColor(NAVY).stroke().restore();
    doc.font("Helvetica-Bold").fontSize(10).fillColor(NAVY);
    doc.text("Net take-home", x0 + 10, y + 6, { width: colW[0] - 20, lineBreak: false });
    doc.text(inr(net), x0 + colW[0] + 10, y + 6, { width: colW[1] - 20, align: "right", lineBreak: false });
    doc.text(inr(net * 12), x0 + colW[0] + colW[1] + 10, y + 6, { width: colW[2] - 20, align: "right", lineBreak: false });
    y += rowH + 6;
    doc.y = y;
    if (meta.salary.note) {
      doc.font("Helvetica").fontSize(8.5).fillColor(MUTED).text(meta.salary.note, MARGIN, doc.y, { width: CONTENT_W });
    }
  }

  /* ------------------------------------------------------------ signatures */
  // The block is 52pt of signing space plus two lines of caption; it must sit
  // above the footer rule at PAGE.h - 56 and never be orphaned on its own page.
  if (doc.y + 112 > PAGE.h - 60) doc.addPage();
  doc.moveDown(1.4);
  const sigY = doc.y;
  const half = CONTENT_W / 2 - 16;
  doc.font("Helvetica").fontSize(9.5).fillColor(MUTED).text(`For ${issuer.name}`, MARGIN, sigY, { width: half });
  doc.text("Accepted by", MARGIN + half + 32, sigY, { width: half });
  const lineY = sigY + 52;
  doc.save().moveTo(MARGIN, lineY).lineTo(MARGIN + half, lineY).lineWidth(0.8).strokeColor(LINE).stroke().restore();
  doc.save().moveTo(MARGIN + half + 32, lineY).lineTo(MARGIN + CONTENT_W, lineY).lineWidth(0.8).strokeColor(LINE).stroke().restore();
  doc.font("Helvetica-Bold").fontSize(9.5).fillColor(INK).text(meta.signatory ?? "Authorised Signatory", MARGIN, lineY + 6, { width: half });
  doc.text(pdfSafe(meta.addressee.name), MARGIN + half + 32, lineY + 6, { width: half });
  doc.font("Helvetica").fontSize(8.5).fillColor(MUTED).text(issuer.name, MARGIN, lineY + 19, { width: half });
  doc.text("Signature and date", MARGIN + half + 32, lineY + 19, { width: half });

  /* --------------------------------------------------------------- footers */
  const range = doc.bufferedPageRange();
  for (let i = 0; i < range.count; i++) {
    doc.switchToPage(range.start + i);
    footer(i + 1, range.count);
  }

  doc.end();
  return done;
}
