import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight } from "lucide-react";

import { requirePermission } from "@/lib/rbac/guard";
import { prisma } from "@/lib/db";
import { PERM } from "@/lib/permissions/codes";
import { usersHolding } from "@/lib/rbac/holders";
import { mapsHref, payoutColumnMapOf } from "@/lib/companies/hubs";
import { Badge, PageHeader } from "@/components/ui/primitives";
import { CompanyScreen } from "./company-screen";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const company = await prisma.company.findUnique({ where: { id }, select: { name: true } });
  return { title: company ? company.name : "Company" };
}

/**
 * A client company's own screen — SOW §3.3. The master list creates and
 * renames; everything a company carries beyond its name lives here.
 */
export default async function CompanyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requirePermission(PERM.masters.company.view);

  const [company, leaderIds, templates] = await Promise.all([
    prisma.company.findUnique({
      where: { id },
      include: {
        city: { select: { name: true } },
        locations: { orderBy: [{ isActive: "desc" }, { name: "asc" }] },
        teamLeaders: { include: { user: { select: { id: true, name: true, email: true } } } },
        offerTemplateInternal: { select: { id: true, name: true } },
        offerTemplateVendor: { select: { id: true, name: true } },
        _count: { select: { riders: true, leads: true, payoutImports: true, invoices: true } },
      },
    }),
    usersHolding(prisma, PERM.task.task.start),
    prisma.offerLetterTemplate.findMany({
      where: { status: "ACTIVE" },
      orderBy: { name: "asc" },
      select: { id: true, name: true, audience: true },
    }),
  ]);
  if (!company) notFound();

  const [leaders, activeRiders] = await Promise.all([
    prisma.user.findMany({
      where: { id: { in: leaderIds }, status: "ACTIVE" },
      orderBy: { name: "asc" },
      select: { id: true, name: true, email: true },
    }),
    prisma.employee.count({
      where: { status: "ACTIVE", onboardingStatus: "ACCEPTED", companies: { some: { companyId: id } } },
    }),
  ]);

  const assignedHere = company.teamLeaders.some((t) => t.userId === ctx.id);
  const canSeeRateCard = ctx.has(PERM.masters.company.viewRateCard) && (ctx.has(PERM.masters.company.update) || assignedHere);

  return (
    <div>
      <PageHeader
        title={company.name}
        description={`${company.code}${company.city ? ` · ${company.city.name}` : ""}${company.addressLine ? ` · ${company.addressLine}` : ""}`}
        breadcrumb={
          <span className="flex items-center gap-1">
            <Link href="/masters?section=companies" className="hover:text-brand-600">Companies</Link>
            <ChevronRight className="h-3 w-3" />
            <span>{company.code}</span>
          </span>
        }
        actions={
          <div className="flex items-center gap-2">
            <Badge tone={company.status === "ACTIVE" ? "good" : "slate"}>{company.status === "ACTIVE" ? "Active" : "Inactive"}</Badge>
            {ctx.has(PERM.masters.company.update) && (
              <Link href={`/masters/companies?q=${encodeURIComponent(company.code)}`} className="text-[12px] font-bold text-brand-700 hover:underline">
                Edit particulars →
              </Link>
            )}
          </div>
        }
      />

      <CompanyScreen
        company={{
          id: company.id,
          name: company.name,
          payoutCycle: company.payoutCycle,
          columnMap: payoutColumnMapOf(company.payoutColumnMap),
          rateCard: company.rateCardKey ? { fileName: company.rateCardFileName ?? "Rate card" } : null,
          offerTemplateInternalId: company.offerTemplateInternalId,
          offerTemplateVendorId: company.offerTemplateVendorId,
          activeRiders,
          riderLinks: company._count.riders,
          leads: company._count.leads,
          payoutImports: company._count.payoutImports,
          invoices: company._count.invoices,
        }}
        hubs={company.locations.map((h) => ({
          id: h.id,
          name: h.name,
          address: h.address,
          latitude: h.latitude === null ? "" : String(Number(h.latitude)),
          longitude: h.longitude === null ? "" : String(Number(h.longitude)),
          mapsUrl: h.mapsUrl,
          mapsHref: mapsHref(h),
          isActive: h.isActive,
        }))}
        leaders={leaders}
        assignedLeaderIds={company.teamLeaders.map((t) => t.userId)}
        templates={templates}
        can={{
          manageHubs: ctx.has(PERM.masters.company.manageHubs),
          assignTeamLeaders: ctx.has(PERM.masters.company.assignTeamLeaders),
          uploadRateCard: ctx.has(PERM.masters.company.uploadRateCard),
          viewRateCard: canSeeRateCard,
          update: ctx.has(PERM.masters.company.update),
          mapPayoutColumns: ctx.has(PERM.masters.company.mapPayoutColumns),
          viewRiders: ctx.has(PERM.hr.employee.view),
        }}
      />
    </div>
  );
}
