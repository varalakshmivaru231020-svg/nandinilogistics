import { cn } from "@/lib/utils";
import { place } from "./figures";

/**
 * The company letterhead and document heading at the top of every printed
 * document: who issues it on the left, what it is and its reference on the right.
 */

/** The Prisma `select` a print page uses to fetch the letterhead's company. */
export const LETTERHEAD_COMPANY_SELECT = {
  name: true, legalName: true, gstin: true, pan: true, cin: true, addressLine: true,
  pincode: true, phone: true, email: true, website: true,
  city: { select: { name: true, state: { select: { name: true } } } },
} as const;

export interface LetterheadCompany {
  name: string;
  legalName: string | null;
  gstin: string | null;
  pan: string | null;
  cin: string | null;
  addressLine: string | null;
  pincode: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  city: { name: string; state: { name: string } } | null;
}

export interface HeadingFact {
  label: string;
  value: React.ReactNode;
  emphasis?: "bold" | "semibold";
}

export function Letterhead({
  company, title, facts,
}: {
  company: LetterheadCompany | null | undefined;
  /** The document's name, printed large: "PURCHASE ORDER", "DEMAND LETTER". */
  title: string;
  /** Reference facts under the title: number, date, status. */
  facts: HeadingFact[];
}) {
  const address = company
    ? place([company.addressLine, company.city?.name, company.city?.state.name, company.pincode])
    : "";

  return (
    <header className="print-keep flex items-start justify-between gap-6 border-b-2 border-navy-950 pb-3">
      <div className="min-w-0">
        <p className="font-display text-[17px] font-extrabold">{company?.legalName || company?.name || "—"}</p>
        {company && (
          <div className="mt-1 space-y-0.5 text-[10.5px] text-muted-600">
            {address && <p>{address}</p>}
            <p>
              {[
                company.gstin && `GSTIN ${company.gstin}`,
                company.pan && `PAN ${company.pan}`,
                company.cin && `CIN ${company.cin}`,
              ].filter(Boolean).join(" · ")}
            </p>
            <p>{[company.phone, company.email, company.website].filter(Boolean).join(" · ")}</p>
          </div>
        )}
      </div>
      <div className="shrink-0 text-right">
        <p className="font-display text-[18px] font-extrabold tracking-wide">{title}</p>
        <table className="mt-1 !w-auto text-[11px] [&_td]:!border-0 [&_td]:!px-0 [&_td]:!py-0.5">
          <tbody>
            {facts.map((f) => (
              <tr key={f.label}>
                <td className="pr-3 text-muted-600">{f.label}</td>
                <td className={cn(f.emphasis === "bold" && "font-bold", f.emphasis === "semibold" && "font-semibold")}>
                  {f.value}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </header>
  );
}
