import Link from "next/link";
import { ChevronRight } from "lucide-react";

import { requirePermission } from "@/lib/rbac/guard";
import { prisma } from "@/lib/db";
import { PERM } from "@/lib/permissions/codes";
import { defaultPeriod } from "@/lib/payouts/compute";
import { PageHeader } from "@/components/ui/primitives";
import { NewImportForm } from "./new-import-form";

export const metadata = { title: "Import a payout sheet" };

export default async function NewPayoutImportPage() {
  await requirePermission(PERM.payout.import.create);
  const nowMs = new Date().getTime();

  const companies = await prisma.company.findMany({
    where: { status: "ACTIVE" },
    orderBy: { name: "asc" },
    select: { id: true, name: true, payoutCycle: true, payoutColumnMap: true },
  });

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="Import a payout sheet"
        description="Choose the company, the period the sheet covers and the file. The sheet is read against the company's column mapping and shown back before anything is saved."
        breadcrumb={
          <span className="flex items-center gap-1">
            <Link href="/payouts" className="hover:text-brand-600">Payouts</Link>
            <ChevronRight className="h-3 w-3" />
            <Link href="/payouts/imports" className="hover:text-brand-600">Sheets</Link>
            <ChevronRight className="h-3 w-3" />
            <span>Import</span>
          </span>
        }
      />
      <NewImportForm
        companies={companies.map((c) => ({
          id: c.id,
          name: c.name,
          cycle: c.payoutCycle,
          mapped: Boolean(c.payoutColumnMap),
          columns: Object.values((c.payoutColumnMap ?? {}) as Record<string, string>).filter(Boolean),
          period: defaultPeriod(c.payoutCycle, nowMs),
        }))}
      />
    </div>
  );
}
