import PDFDocument from "pdfkit";

/**
 * The offer letter — SOW §3.2: a template from Masters with the rider's
 * details merged in, produced as a PDF on acceptance.
 *
 * `mergeOfferLetter` is pure, so what the letter says can be asserted; the
 * PDF is only the rendering of that text.
 */

export interface OfferLetterFacts {
  name: string;
  riderId: string;
  company: string;
  /** Already formatted, as the letter should print it. */
  joiningDate: string;
  rateCard: string;
}

const PLACEHOLDERS: Array<[token: string, key: keyof OfferLetterFacts]> = [
  ["name", "name"],
  ["riderId", "riderId"],
  ["company", "company"],
  ["joiningDate", "joiningDate"],
  ["rateCard", "rateCard"],
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
      (out, [token, key]) => out.replace(new RegExp(`\\{\\{\\s*${token}\\s*\\}\\}`, "g"), facts[key]),
      text,
    );
  return { subject: merge(template.subject), body: merge(template.body) };
}

/** The letterhead the PDF prints under. */
const LETTERHEAD = "Nandini Logistics";

function pdfSafe(text: string): string {
  return text.replace(/₹\s?/g, "Rs. ");
}

/** The merged letter as an A4 PDF. */
export async function renderOfferLetterPdf(
  letter: { subject: string; body: string },
  meta: { riderId: string; generatedAt: Date },
): Promise<Buffer> {
  const doc = new PDFDocument({
    size: "A4",
    margin: 56,
    info: { Title: letter.subject, Author: LETTERHEAD, CreationDate: meta.generatedAt },
  });

  const chunks: Buffer[] = [];
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });

  doc.font("Helvetica-Bold").fontSize(18).fillColor("#191A5C").text(LETTERHEAD);
  doc.font("Helvetica").fontSize(9).fillColor("#7A80A3")
    .text(`Offer letter · ${meta.riderId} · ${meta.generatedAt.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}`);
  doc.moveDown(1.2);

  doc.font("Helvetica-Bold").fontSize(13).fillColor("#22264A").text(pdfSafe(letter.subject));
  doc.moveDown(0.8);

  doc.font("Helvetica").fontSize(11).fillColor("#22264A");
  for (const paragraph of letter.body.split(/\r?\n/)) {
    if (paragraph.trim() === "") doc.moveDown(0.6);
    else doc.text(pdfSafe(paragraph), { align: "left" });
  }

  doc.end();
  return done;
}
